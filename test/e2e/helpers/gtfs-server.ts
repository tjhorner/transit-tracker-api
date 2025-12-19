import archiver from "archiver"
import express from "express"
import { transit_realtime as GtfsRt } from "gtfs-realtime-bindings"
import { Server } from "http"
import path from "path"

export async function setupFakeGtfsServer() {
  const gtfsServerApp = express()
  gtfsServerApp.use(
    express.static(path.join(__dirname, "..", "fixtures", "gtfs-static")),
  )

  gtfsServerApp.use((req, res, next) => {
    if (req.headers["authorization"] !== "fake-auth") {
      res.status(401).send("Unauthorized")
      return
    }

    next()
  })

  let currentTripUpdates: GtfsRt.ITripUpdate[] = []
  let simulateTripUpdatesFailure = false

  gtfsServerApp.get("/feed.zip", (_, res) => {
    res.setHeader("Content-Type", "application/zip")

    const archive = archiver("zip")
    archive.pipe(res)
    archive.directory(path.join(__dirname, "..", "fixtures", "gtfs-feed"), "/")
    archive.finalize()
  })

  gtfsServerApp.get("/feed-2.zip", (_, res) => {
    res.setHeader("Content-Type", "application/zip")

    const archive = archiver("zip")
    archive.pipe(res)
    archive.directory(
      path.join(__dirname, "..", "fixtures", "gtfs-feed-2"),
      "/",
    )
    archive.finalize()
  })

  gtfsServerApp.get("/gtfs-rt/trip-updates", (_, res) => {
    if (simulateTripUpdatesFailure) {
      res.status(500).send("Simulated failure")
      return
    }

    const message = new GtfsRt.FeedMessage({
      header: {
        gtfsRealtimeVersion: "1.0",
        incrementality: GtfsRt.FeedHeader.Incrementality.FULL_DATASET,
        timestamp: Math.floor(Date.now() / 1000),
      },
      entity: currentTripUpdates.map((tripUpdate, idx) => ({
        id: idx.toString(),
        tripUpdate,
      })),
    })

    res.setHeader("Content-Type", "application/x-protobuf")
    res.setHeader("Cache-Control", "no-cache")

    res.status(200).send(GtfsRt.FeedMessage.encode(message).finish())
  })

  const server = await new Promise<Server>((resolve, reject) => {
    const server = gtfsServerApp.listen(3123, (err) => {
      if (err) {
        return reject(err)
      }

      resolve(server)
    })
  })

  function setTripUpdates(updates: GtfsRt.ITripUpdate[]) {
    currentTripUpdates = updates
  }

  return {
    server,
    setTripUpdates,
    setSimulateTripUpdatesFailure: (simulate: boolean) => {
      simulateTripUpdatesFailure = simulate
    },
  }
}
