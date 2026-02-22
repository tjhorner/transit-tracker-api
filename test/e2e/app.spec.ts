import { INestApplication } from "@nestjs/common"
import { WsAdapter } from "@nestjs/platform-ws"
import { Test } from "@nestjs/testing"
import { StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis"
import fs from "fs/promises"
import { transit_realtime as GtfsRt } from "gtfs-realtime-bindings"
import ms from "ms"
import path from "path"
import { AppModule } from "src/app.module"
import { SyncCommand } from "src/commands/sync.command"
import { TripDto } from "src/schedule/schedule.controller"
import request from "supertest"
import { promisify } from "util"
import { MockInstance, vi } from "vitest"
import { setupFakeGtfsServer } from "./helpers/gtfs-server"
import { setupTestDatabase } from "./helpers/postgres"

const testTmpDir = path.join(__dirname, "tmp", `test-${Date.now()}`)

const preImportHookPath = path.join(testTmpDir, "pre-import-hook.txt")
const postImportHookPath = path.join(testTmpDir, "post-import-hook.txt")

describe("E2E test", () => {
  let postgresContainer: StartedPostgreSqlContainer
  let redisContainer: StartedRedisContainer
  let fakeGtfs: Awaited<ReturnType<typeof setupFakeGtfsServer>>
  let app: INestApplication

  beforeAll(async () => {
    await fs.mkdir(testTmpDir, { recursive: true })

    const { postgresContainer: pgContainer, connectionUrl } =
      await setupTestDatabase()

    postgresContainer = pgContainer
    process.env.DATABASE_URL = connectionUrl.toString()

    redisContainer = await new RedisContainer().start()
    process.env.REDIS_URL = redisContainer.getConnectionUrl()

    process.env.FEEDS_CONFIG = await fs.readFile(
      path.join(__dirname, "fixtures", "feeds.test.yaml"),
      "utf-8",
    )

    if (process.platform === "win32") {
      process.env.PRE_IMPORT_HOOK = `type nul > "${preImportHookPath}"`
      process.env.POST_IMPORT_HOOK = `type nul > "${postImportHookPath}"`
    } else {
      process.env.PRE_IMPORT_HOOK = `touch ${preImportHookPath}`
      process.env.POST_IMPORT_HOOK = `touch ${postImportHookPath}`
    }

    fakeGtfs = await setupFakeGtfsServer()

    process.env.DISABLE_RATE_LIMITS = "true"

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
    await app.init()

    await app.get(SyncCommand).run([], {})
  }, ms("2m"))

  afterAll(async () => {
    await fs.rm(testTmpDir, { recursive: true, force: true })

    await app.close()
    await Promise.all([
      postgresContainer.stop(),
      redisContainer.stop(),
      promisify(fakeGtfs.server.close).bind(fakeGtfs.server)(),
    ])
  })

  test("import hooks were executed", async () => {
    const preImportHookExists = await fs
      .access(preImportHookPath)
      .then(() => true)
      .catch(() => false)

    const postImportHookExists = await fs
      .access(postImportHookPath)
      .then(() => true)
      .catch(() => false)

    expect(preImportHookExists).toBe(true)
    expect(postImportHookExists).toBe(true)
  })

  test("GET /feeds", async () => {
    const response = await request(app.getHttpServer())
      .get("/feeds")
      .expect("Content-Type", /json/)
      .expect(200)

    expect(response.body).toHaveLength(2)

    const feed = response.body.find((f: any) => f.code === "testfeed")

    expect(feed.lastSyncedAt).toBeDefined()

    const now = new Date().getTime()
    const lastSyncedAt = new Date(feed.lastSyncedAt).getTime()
    expect(lastSyncedAt).toBeLessThanOrEqual(now)
    expect(lastSyncedAt).toBeGreaterThanOrEqual(now - ms("5m"))

    expect(feed.code).toBe("testfeed")
    expect(feed.name).toBe("Test Feed")
    expect(feed.description).toBe("Test Feed Description")
    expect(feed.bounds).toEqual([-117.13316, 36.42529, -116.40094, 36.915684])
  })

  test("GET /feeds/service-areas", async () => {
    const response = await request(app.getHttpServer())
      .get("/feeds/service-areas")
      .expect("Content-Type", /json/)
      .expect(200)

    expect(response.body).toMatchSnapshot()
  })

  test("GET /stops/within/:bbox", async () => {
    const response = await request(app.getHttpServer())
      .get("/stops/within/-116.774095,36.909629,-116.760877,36.917066")
      .expect("Content-Type", /json/)
      .expect(200)

    expect(response.body).toMatchSnapshot()
    expect(response.body).toHaveLength(2)
  })

  test("GET /stops/:id/routes", async () => {
    const response = await request(app.getHttpServer())
      .get("/stops/testfeed:AMV/routes")
      .expect("Content-Type", /json/)
      .expect(200)

    expect(response.body).toHaveLength(1)
    expect(response.body).toMatchSnapshot()
  })

  describe("GET /schedule/:routeStopPairs", () => {
    let dateSpy: MockInstance<() => any>

    beforeEach(() => {
      dateSpy = vi.spyOn(Date, "now")
      dateSpy.mockImplementation(() =>
        new Date("2008-01-04T13:30:00Z").getTime(),
      )
    })

    afterEach(() => {
      dateSpy.mockRestore()
    })

    async function getTripSchedule(
      scheduleString: string = "testfeed:AAMV,testfeed:BEATTY_AIRPORT;testfeed:STBA,testfeed:STAGECOACH",
    ) {
      const response = await request(app.getHttpServer())
        .get(`/schedule/${scheduleString}`)
        .expect("Content-Type", /json/)
        .expect(200)

      expect(response.body).toHaveProperty("trips")
      return response.body.trips as TripDto[]
    }

    test("with static schedule", async () => {
      const trips = await getTripSchedule()
      expect(trips).toMatchSnapshot()
    })

    test("with service exception in static schedule", async () => {
      dateSpy.mockImplementation(() =>
        new Date("2007-06-04T13:30:00Z").getTime(),
      )

      const trips = await getTripSchedule()
      expect(trips).toMatchSnapshot()

      // Expect trip for the 4th to be skipped
      expect(new Date(trips[0].arrivalTime * 1000).getUTCDate()).toBe(5)
    })

    test("with interpolated stop_times", async () => {
      const trips = await getTripSchedule("testfeed:CITY,testfeed:NADAV")

      const interpolatedTrip = trips.find((t) => t.tripId === "testfeed:CITY2")

      expect(interpolatedTrip).toBeDefined()

      const arrival = new Date(interpolatedTrip!.arrivalTime * 1000)
      expect(arrival.getUTCHours()).toBe(14)
      expect(arrival.getUTCMinutes()).toBe(42)
      expect(arrival.getUTCSeconds()).toBe(0)

      expect(interpolatedTrip!.arrivalTime).toBe(
        interpolatedTrip!.departureTime,
      )
    })

    test("with frequency-based trip", async () => {
      const trips = await getTripSchedule("testfeed:AB,testfeed:BEATTY_AIRPORT")

      // We want to skip frequency-based trips for now since they are unsupported
      expect(trips.some((trip) => trip.tripId === "testfeed:AB1")).toBe(false)
    })

    describe("with GTFS-RT updates", () => {
      afterEach(() => {
        fakeGtfs.setTripUpdates([])
        fakeGtfs.setSimulateTripUpdatesFailure(false)
      })

      test("falls back to static schedule if GTFS-RT fails", async () => {
        fakeGtfs.setSimulateTripUpdatesFailure(true)

        const trips = await getTripSchedule()
        expect(trips.length).toBeGreaterThan(0)
        expect(trips).toMatchSnapshot()
      })

      test("with same trip on multiple days", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "STBA",
              startDate: "20080104",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopId: "STAGECOACH",
                arrival: {
                  time: 1199455200,
                },
              },
            ],
            vehicle: {
              id: "5097",
              label: "411"
            }
          },
          {
            trip: {
              tripId: "STBA",
              startDate: "20080105",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopId: "STAGECOACH",
                arrival: {
                  time: 1199541600,
                },
              },
            ],
            vehicle: {
              id: "5277",
              label: "420"
            }
          },
        ])

        const trips = await getTripSchedule()
        const updatedTrips = trips.filter(
          (trip) => trip.tripId === "testfeed:STBA",
        )

        expect(updatedTrips).toHaveLength(2)

        expect(updatedTrips[0].arrivalTime).toBe(1199455200)
        expect(updatedTrips[0].vehicle).toBe("411")
        expect(updatedTrips[0].isRealtime).toBe(true)

        expect(updatedTrips[1].arrivalTime).toBe(1199541600)
        expect(updatedTrips[1].vehicle).toBe("420")
        expect(updatedTrips[1].isRealtime).toBe(true)
      })

      test("with same trip on multiple days using ambiguous start_date", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "STBA",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopId: "STAGECOACH",
                arrival: {
                  time: 1199455200,
                },
              },
            ],
            vehicle: {
              id: "5097",
              label: "411"
            }
          },
        ])

        const trips = await getTripSchedule()
        const updatedTrips = trips.filter(
          (trip) => trip.tripId === "testfeed:STBA",
        )

        expect(updatedTrips).toHaveLength(2)

        expect(updatedTrips[0].arrivalTime).toBe(1199455200)
        expect(updatedTrips[0].vehicle).toBe("411")
        expect(updatedTrips[0].isRealtime).toBe(true)

        expect(updatedTrips[1].arrivalTime).toBe(1199541600)
        expect(updatedTrips[1].vehicle).toBeNull()
        expect(updatedTrips[1].isRealtime).toBe(false)
      })

      test("with cancelled trip on multiple days using ambiguous start_date", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "STBA",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.CANCELED,
            },
          },
        ])

        const trips = await getTripSchedule()
        const remainingUncancelledTrips = trips.filter(
          (trip) => trip.tripId === "testfeed:STBA",
        )

        // Expect that we have only cancelled one of the two STBA trips
        expect(remainingUncancelledTrips).toHaveLength(1)
        expect(remainingUncancelledTrips[0].arrivalTime).toBe(1199541600)
      })

      test("with skipped stop on multiple days using ambiguous start_date", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "STBA",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopId: "STAGECOACH",
                scheduleRelationship:
                  GtfsRt.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
              },
            ],
          },
        ])

        const trips = await getTripSchedule()
        const remainingUncancelledTrips = trips.filter(
          (trip) => trip.tripId === "testfeed:STBA",
        )

        // Expect that we have only cancelled one of the two STBA trips
        expect(remainingUncancelledTrips).toHaveLength(1)
        expect(remainingUncancelledTrips[0].arrivalTime).toBe(1199541600)
      })

      test("with time update more than 90 minutes deviated from schedule", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "STBA",
              startDate: "20080104",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopId: "STAGECOACH",
                arrival: {
                  time: 1199460700,
                },
              },
            ],
          },
        ])

        const trips = await getTripSchedule()
        expect(
          trips.some(
            (trip) =>
              trip.tripId === "testfeed:STBA" &&
              trip.arrivalTime === 1199460700,
          ),
        ).toBe(false)
        expect(
          trips.some(
            (trip) => trip.tripId === "testfeed:STBA" && trip.isRealtime,
          ),
        ).toBe(false)
      })

      test.each(["arrival", "departure"])(
        "with %s time update",
        async (arrivalOrDeparture: string) => {
          fakeGtfs.setTripUpdates([
            {
              trip: {
                tripId: "STBA",
                startDate: "20080104",
                scheduleRelationship:
                  GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
              },
              stopTimeUpdate: [
                {
                  stopId: "STAGECOACH",
                  [arrivalOrDeparture]: {
                    time: 1199455230,
                  },
                },
              ],
              vehicle: {
                id: "5097",
                label: "411"
              }
            },
          ])

          const trips = await getTripSchedule()
          const trip = trips.find((trip) => trip.tripId === "testfeed:STBA")

          expect(trip).toBeDefined()
          expect(trip!.arrivalTime).toBe(1199455230)
          expect(trip!.departureTime).toBe(1199455230)
          expect(trip!.vehicle).toBe("411")
          expect(trip!.isRealtime).toBe(true)
        },
      )

      test("with different arrival and departure time updates", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "STBA",
              startDate: "20080104",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopId: "STAGECOACH",
                arrival: {
                  time: 1199455230,
                },
                departure: {
                  time: 1199455260,
                },
              },
            ],
            vehicle: {
              id: "5097",
              label: "411"
            }
          },
        ])

        const trips = await getTripSchedule()
        const trip = trips.find((trip) => trip.tripId === "testfeed:STBA")

        expect(trip).toBeDefined()
        expect(trip!.arrivalTime).toBe(1199455230)
        expect(trip!.departureTime).toBe(1199455260)
        expect(trip!.vehicle).toBe("411")
        expect(trip!.isRealtime).toBe(true)
      })

      test.each(["arrival", "departure"])(
        "with %s delay",
        async (arrivalOrDeparture: string) => {
          fakeGtfs.setTripUpdates([
            {
              trip: {
                tripId: "STBA",
                startDate: "20080104",
                scheduleRelationship:
                  GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
              },
              stopTimeUpdate: [
                {
                  stopId: "STAGECOACH",
                  [arrivalOrDeparture]: {
                    delay: 30,
                  },
                },
              ],
              vehicle: {
                id: "5097",
                label: "411"
              }
            },
          ])

          const trips = await getTripSchedule()
          const trip = trips.find((trip) => trip.tripId === "testfeed:STBA")

          expect(trip).toBeDefined()
          expect(trip!.arrivalTime).toBe(1199455230)
          expect(trip!.departureTime).toBe(1199455230)
          expect(trip!.vehicle).toBe("411")
          expect(trip!.isRealtime).toBe(true)
        },
      )

      test("with different arrival and departure delays", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "STBA",
              startDate: "20080104",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopId: "STAGECOACH",
                arrival: {
                  delay: 30,
                },
                departure: {
                  delay: 60,
                },
              },
            ],
            vehicle: {
              id: "5097",
              label: "411"
            }
          },
        ])

        const trips = await getTripSchedule()
        const trip = trips.find((trip) => trip.tripId === "testfeed:STBA")

        expect(trip).toBeDefined()
        expect(trip!.arrivalTime).toBe(1199455230) // + 30
        expect(trip!.departureTime).toBe(1199455260) // + 60
        expect(trip!.vehicle).toBe("411")
        expect(trip!.isRealtime).toBe(true)
      })

      test("with cancelled trip", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "AAMV1",
              startDate: "20080105",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.CANCELED,
            },
          },
        ])

        const trips = await getTripSchedule()
        expect(trips.some((trip) => trip.tripId === "testfeed:AAMV1")).toBe(
          false,
        )
      })

      test("with update to overnight trip (crossing midnight)", async () => {
        dateSpy.mockImplementation(() =>
          new Date("2008-01-05T08:25:00.000Z").getTime(),
        )

        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "STBA_OVERNIGHT",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopId: "STAGECOACH",
                arrival: {
                  time: 1199521830,
                },
              },
            ],
          },
        ])

        const trips = await getTripSchedule()
        const overnightTrips = trips.filter(
          (trip) => trip.tripId === "testfeed:STBA_OVERNIGHT",
        )

        expect(overnightTrips).toHaveLength(2)

        expect(overnightTrips[0].arrivalTime).toBe(1199521830)
        expect(overnightTrips[0].departureTime).toBe(1199521830)
        expect(overnightTrips[0].isRealtime).toBe(true)

        expect(overnightTrips[1].arrivalTime).toBe(1199608200)
        expect(overnightTrips[1].departureTime).toBe(1199608200)
        expect(overnightTrips[1].isRealtime).toBe(false)
      })

      test("with skipped stop by stop_id", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "AAMV2",
              startDate: "20080105",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopId: "BEATTY_AIRPORT",
                scheduleRelationship:
                  GtfsRt.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
              },
            ],
          },
          {
            trip: {
              tripId: "AAMV3",
              startDate: "20080105",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopId: "SOME_OTHER_STOP",
                scheduleRelationship:
                  GtfsRt.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
              },
            ],
          },
        ])

        const trips = await getTripSchedule()
        expect(trips.some((trip) => trip.tripId === "testfeed:AAMV2")).toBe(
          false,
        )

        expect(trips.some((trip) => trip.tripId === "testfeed:AAMV3")).toBe(
          true,
        )
      })

      test("with skipped stop by stop_sequence", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "AAMV2",
              startDate: "20080105",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopSequence: 2, // stop_id: BEATTY_AIRPORT
                scheduleRelationship:
                  GtfsRt.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
              },
            ],
          },
          {
            trip: {
              tripId: "AAMV3",
              startDate: "20080105",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopSequence: 2, // stop_id: AMV
                scheduleRelationship:
                  GtfsRt.TripUpdate.StopTimeUpdate.ScheduleRelationship.SKIPPED,
              },
            ],
          },
        ])

        const trips = await getTripSchedule()
        expect(trips.some((trip) => trip.tripId === "testfeed:AAMV2")).toBe(
          false,
        )

        expect(trips.some((trip) => trip.tripId === "testfeed:AAMV3")).toBe(
          true,
        )
      })

      // Tests for fallback delay from previous stop updates
      test("with fallback delay from previous stop", async () => {
        const delaySeconds = 120
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "CITY1",
              startDate: "20080104",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopSequence: 0,
                arrival: {
                  delay: delaySeconds,
                },
              },
              // No update for stopSequence: 2, should use fallback
            ],
            vehicle: {
              id: "53967",
              label: "1594"
            }
          },
        ])

        const trips = await getTripSchedule("testfeed:CITY,testfeed:NADAV")
        const trip = trips.find((trip) => trip.tripId === "testfeed:CITY1")
        expect(trip).toBeDefined()

        // Should use the 120s delay from previous stop
        const scheduledTimeArrivalTime = 1199455920
        const scheduledDepartureTime = 1199456040
        expect(trip!.arrivalTime).toBe(scheduledTimeArrivalTime + delaySeconds)
        expect(trip!.departureTime).toBe(scheduledDepartureTime + delaySeconds)
        expect(trip!.vehicle).toBe("1594")
        expect(trip!.isRealtime).toBe(true)
      })

      test("with fallback delay when multiple previous stops exist", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "CITY1",
              startDate: "20080104",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopSequence: 1,
                arrival: {
                  delay: 60,
                },
              },
              {
                stopSequence: 2,
                arrival: {
                  delay: 90, // More recent delay
                },
              },
            ],
            vehicle: {
              id: "53967",
              label: "1594"
            }
          },
        ])

        const trips = await getTripSchedule("testfeed:CITY,testfeed:NADAV")
        const trip = trips.find((trip) => trip.tripId === "testfeed:CITY1")
        expect(trip).toBeDefined()

        // Should use the 90s delay from stop sequence 2
        const scheduledTimeArrivalTime = 1199455920
        const scheduledDepartureTime = 1199456040
        expect(trip!.arrivalTime).toBe(scheduledTimeArrivalTime + 90)
        expect(trip!.departureTime).toBe(scheduledDepartureTime + 90)
        expect(trip!.vehicle).toBe("1594")
        expect(trip!.isRealtime).toBe(true)
      })

      test("without fallback when no previous stop updates exist", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "CITY1",
              startDate: "20080104",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopSequence: 4, // Update for a LATER stop (DADAN)
                arrival: {
                  delay: 120,
                },
              },
            ],
            vehicle: {
              id: "53967",
              label: "1594"
            }
          },
        ])

        const trips = await getTripSchedule("testfeed:CITY,testfeed:NADAV")
        const trip = trips.find((trip) => trip.tripId === "testfeed:CITY1")
        expect(trip).toBeDefined()

        // Should use scheduled time (1199455920) because update is for a later stop
        expect(trip!.arrivalTime).toBe(1199455920)
        expect(trip!.vehicle).toBeNull()
        expect(trip!.isRealtime).toBe(false)
      })

      test("with fallback delay respects 90m deviation limit", async () => {
        fakeGtfs.setTripUpdates([
          {
            trip: {
              tripId: "CITY1",
              startDate: "20080104",
              scheduleRelationship:
                GtfsRt.TripDescriptor.ScheduleRelationship.SCHEDULED,
            },
            stopTimeUpdate: [
              {
                stopSequence: 1, // Update for an EARLIER stop (STAGECOACH)
                arrival: {
                  delay: 6000, // 100 minutes delay - exceeds 90m limit
                },
              },
            ],
            vehicle: {
              id: "53967",
              label: "1594"
            }
          },
        ])

        const trips = await getTripSchedule("testfeed:CITY,testfeed:NADAV")
        const trip = trips.find((trip) => trip.tripId === "testfeed:CITY1")
        expect(trip).toBeDefined()

        // Should fall back to scheduled time due to excessive deviation (> 90m)
        expect(trip!.arrivalTime).toBe(1199455920)
        expect(trip!.vehicle).toBeNull()
        expect(trip!.isRealtime).toBe(false)
      })
    })
  })
})
