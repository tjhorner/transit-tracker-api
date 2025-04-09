import { INestApplication } from "@nestjs/common"
import { WsAdapter } from "@nestjs/platform-ws"
import { Test } from "@nestjs/testing"
import { StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis"
import fs from "fs/promises"
import path from "path"
import { AppModule } from "src/app.module"
import { FeedSyncService } from "src/modules/feed/feed-sync.service"
import request from "supertest"
import { setupTestDatabase } from "./helpers/postgres"

describe("E2E test", () => {
  let postgresContainer: StartedPostgreSqlContainer
  let redisContainer: StartedRedisContainer
  let app: INestApplication

  beforeAll(async () => {
    const { postgresContainer: pgContainer, gtfsUserUrl } =
      await setupTestDatabase()

    process.env.DATABASE_URL = gtfsUserUrl.toString()
    postgresContainer = pgContainer

    redisContainer = await new RedisContainer().start()
    process.env.REDIS_URL = redisContainer.getConnectionUrl()

    process.env.FEEDS_CONFIG = await fs.readFile(
      path.join(__dirname, "fixtures", "feeds.test.yaml"),
      "utf-8",
    )

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
    await app.init()

    await app.get(FeedSyncService).syncAllFeeds()
  }, 120_000)

  afterAll(async () => {
    await Promise.all([
      postgresContainer.stop(),
      redisContainer.stop(),
      app.close(),
    ])
  })

  test("GET /feeds", async () => {
    const response = await request(app.getHttpServer())
      .get("/feeds")
      .expect("Content-Type", /json/)
      .expect(200)

    expect(response.body).toHaveLength(1)

    const feed = response.body[0]
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
    
    expect(response.body).toHaveLength(2)
    expect(response.body).toMatchSnapshot()
  })

  test("GET /stops/:id/routes", async () => {
    const response = await request(app.getHttpServer())
      .get("/stops/testfeed:AMV/routes")
      .expect("Content-Type", /json/)
      .expect(200)
    
    expect(response.body).toHaveLength(1)
    expect(response.body).toMatchSnapshot()
  })

  test("GET /schedule/:routeStopPairs", async () => {
    const dateSpy = jest.spyOn(Date, "now")
    dateSpy.mockImplementation(() => (
      new Date("2008-01-04T14:00:00Z").getTime()
    ))

    const response = await request(app.getHttpServer())
      .get("/schedule/testfeed:AAMV,testfeed:BEATTY_AIRPORT;testfeed:STBA,testfeed:STAGECOACH")
      .expect("Content-Type", /json/)
      .expect(200)

    expect(response.body).toHaveProperty("trips")
    expect(response.body).toMatchSnapshot()

    dateSpy.mockRestore()
  })
})
