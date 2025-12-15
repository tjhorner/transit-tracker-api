import { Injectable, Logger } from "@nestjs/common"
import axios from "axios"
import { tmpdir } from "node:os"
import path from "node:path"
import { rimraf } from "rimraf"
import * as unzipper from "unzipper"
import { FetchConfig } from "../config"

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

      await rimraf(parentZipTempPath)

      return
    }

    await axios({
      url: url.toString(),
      method: "get",
      responseType: "stream",
      responseEncoding: "binary",
      headers: resource.headers,
    }).then((response) => {
      const extractor = unzipper.Extract({ path: destinationPath })
      return new Promise<typeof response>((resolve, reject) => {
        response.data.pipe(extractor)

        let error: any = null
        extractor.on("error", (err) => {
          error = err
          extractor.end()
          reject(err)
        })

        extractor.on("close", () => {
          if (!error) {
            resolve(response)
          }
        })
      })
    })
  }
}
