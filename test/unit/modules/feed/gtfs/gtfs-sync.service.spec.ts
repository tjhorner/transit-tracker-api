import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Writable } from "node:stream"
import { GtfsSyncService } from "src/modules/feed/modules/gtfs/sync/gtfs-sync.service"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

function createService() {
  const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() }
  return new GtfsSyncService(
    { feedCode: "test", config: {} } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    logger as any,
  )
}

function createCopyClient() {
  let copied = ""
  const client = {
    query: vi.fn(
      () =>
        new Writable({
          write(chunk, _encoding, callback) {
            copied += chunk.toString()
            callback()
          },
        }),
    ),
  }
  return { client, copied: () => copied }
}

function createInsertClient() {
  const client = { query: vi.fn().mockResolvedValue({}) }
  return { client, insertedValues: () => client.query.mock.calls[0]?.[1] }
}

const mapAgency = (row: any) => ({
  agency_id: row.agency_id,
  agency_name: row.agency_name,
})

describe("GtfsSyncService import", () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "gtfs-sync-service-test-"))
  })

  afterEach(async () => {
    delete process.env.GTFS_IMPORT_METHOD
    await rm(directory, { recursive: true, force: true })
  })

  async function importAgency(contents: string, client: any) {
    const filePath = join(directory, "agency.txt")
    await writeFile(filePath, contents)
    return (createService() as any).importGtfsFile(
      client,
      "agency",
      filePath,
      mapAgency,
    )
  }

  describe("with COPY", () => {
    it("rejects instead of crashing when the CSV cannot be parsed", async () => {
      const { client } = createCopyClient()
      await expect(
        importAgency('agency_id,agency_name\n"1,TTC\n', client),
      ).rejects.toThrow(/missing closing/)
    })

    it("drops values beyond the header columns", async () => {
      const { client, copied } = createCopyClient()
      await importAgency("agency_id,agency_name\n1,TTC,extra\n", client)
      expect(copied()).toBe("feed_code,agency_id,agency_name\ntest,1,TTC")
    })
  })

  describe("with INSERT", () => {
    beforeEach(() => {
      process.env.GTFS_IMPORT_METHOD = "insert"
    })

    it("rejects instead of crashing when the CSV cannot be parsed", async () => {
      const { client } = createInsertClient()
      await expect(
        importAgency('agency_id,agency_name\n"1,TTC\n', client),
      ).rejects.toThrow(/missing closing/)
    })

    it("drops values beyond the header columns", async () => {
      const { client, insertedValues } = createInsertClient()
      await importAgency("agency_id,agency_name\n1,TTC,extra\n", client)
      expect(insertedValues()).toEqual(["test", "1", "TTC"])
    })
  })
})
