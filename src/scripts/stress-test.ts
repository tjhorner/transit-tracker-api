import { StopRoute } from "src/modules/feed/interfaces/feed-provider.interface"
import { allStops } from "./stops"
import fs from "fs"
import { WebSocket } from "ws"

const routeStopPairs: string[] = []
const rspChunks: string[][] = []

function shuffleInPlace<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = array[i]
    array[i] = array[j]
    array[j] = temp
  }
}

async function subscribe(rsps: string) {
  const ws = new WebSocket("ws://localhost:3000")
  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        event: "schedule:subscribe",
        data: {
          feedCode: "st",
          routeStopPairs: rsps,
          limit: 1,
        },
      }),
    )
  })

  ws.on("close", () => {
    setTimeout(
      () => {
        console.log("reconnecting")
        subscribe(rsps)
      },
      Math.floor(Math.random() * 30_000),
    )
  })

  ws.on("message", (data) => {
    // console.log(data)
  })
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  for (const stop of allStops) {
    const routes = stop.routes
    const randomRoute = routes[Math.floor(Math.random() * routes.length)]

    const pushAmount = Math.floor(Math.random() * 3) + 1
    for (let i = 0; i < pushAmount; i++) {
      routeStopPairs.push(`${randomRoute.routeId},${stop.stopId}`)
    }
  }

  shuffleInPlace(routeStopPairs)

  while (routeStopPairs.length) {
    const randomChunkSize = Math.floor(Math.random() * 3) + 1
    rspChunks.push(routeStopPairs.splice(0, randomChunkSize))
  }

  console.log("Subscribing to", rspChunks.length, "chunks")

  for (const chunk of rspChunks) {
    await subscribe(chunk.join(";"))
    await wait(1500)
  }

  console.log("Done")
}

main()
