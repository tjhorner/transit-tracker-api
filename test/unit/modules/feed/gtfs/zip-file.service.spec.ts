import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ZipFileService } from "src/modules/feed/modules/gtfs/sync/zip-file.service"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fixturesPath = join(__dirname, "__fixtures__")

describe("ZipFileService", () => {
  let destinationPath: string

  beforeEach(async () => {
    destinationPath = await mkdtemp(join(tmpdir(), "zip-file-service-test-"))
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await rm(destinationPath, { recursive: true, force: true })
  })

  it("extracts entries whose compressed data contains the data descriptor signature", async () => {
    const zipBytes = await readFile(
      join(fixturesPath, "descriptor-signature-in-entry-data.zip"),
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array(zipBytes))),
    )

    await new ZipFileService().downloadAndExtract(
      { url: "https://example.com/gtfs.zip" },
      destinationPath,
    )

    await expect(
      readFile(join(destinationPath, "stop_times.txt"), "latin1"),
    ).resolves.toBe("trip_id,stop_id\nPK\x07\x08,1\n")
    await expect(
      readFile(join(destinationPath, "stops.txt"), "utf8"),
    ).resolves.toBe("stop_id,stop_name\n1,Main St\n")
  })
})
