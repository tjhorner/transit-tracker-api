import { Injectable, Logger } from "@nestjs/common"
import fs from "fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import * as unzipper from "unzipper"
import { FetchConfig } from "../config"
import { EmptyResponseBodyError, UpstreamHttpError } from "../gtfs.errors"

@Injectable()
export class ZipFileService {
  private readonly logger = new Logger(ZipFileService.name)

  async downloadAndExtract(
    resource: FetchConfig,
    destinationPath: string,
  ): Promise<void> {
    const url = new URL(resource.url)
    if (url.hash !== "") {
      const subZipFileName = decodeURIComponent(url.hash.substring(1))
      url.hash = ""

      const parentZipTempPath = path.join(
        tmpdir(),
        `gtfs-parent-zip-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 15)}`,
      )

      await this.downloadAndExtract(
        {
          url: url.toString(),
          headers: resource.headers,
        },
        parentZipTempPath,
      )

      this.logger.log(`Extracting sub-zip file ${subZipFileName}`)

      const subZipFilePath = path.join(parentZipTempPath, subZipFileName)

      const archive = await unzipper.Open.file(subZipFilePath)
      await archive.extract({ path: destinationPath })

      await fs.rm(parentZipTempPath, { recursive: true, force: true })

      return
    }

    const response = await fetch(url, {
      method: "GET",
      headers: resource.headers,
    })

    if (!response.ok) {
      throw new UpstreamHttpError(
        "GET",
        response.url,
        response.status,
        response.statusText,
      )
    }

    if (!response.body) {
      throw new EmptyResponseBodyError()
    }

    const nodeStream = Readable.fromWeb(response.body as any)
    const extractor = unzipper.Extract({ path: destinationPath })

    await new Promise<void>((resolve, reject) => {
      nodeStream.pipe(extractor)

      let error: any = null
      extractor.on("error", (err) => {
        error = err
        extractor.end()
        reject(err)
      })

      extractor.on("close", () => {
        if (!error) {
          resolve()
        }
      })
    })

    await this.flattenDirectory(destinationPath)
  }

  private async flattenDirectory(directory: string): Promise<void> {
    const subdirs = await fs.readdir(directory, {
      withFileTypes: true,
      recursive: false,
    })

    if (subdirs.length === 1 && subdirs[0].isDirectory()) {
      const dirName = subdirs[0].name

      this.logger.log(
        `Found single directory "${dirName}" in zip, flattening...`,
      )

      const singleDir = path.join(directory, dirName)
      const files = await fs.readdir(singleDir)
      for (const file of files) {
        await fs.rename(path.join(singleDir, file), path.join(directory, file))
      }
      await fs.rmdir(singleDir)
    }
  }
}
