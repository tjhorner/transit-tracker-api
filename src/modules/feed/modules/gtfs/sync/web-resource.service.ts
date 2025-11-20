import { Injectable } from "@nestjs/common"
import crypto from "crypto"

export interface WebResourceMetadata {
  hash: string | null
  lastModified: Date | null
  etag: string | null
}

@Injectable()
export class WebResourceService {
  async getResourceMetadata(
    url: string,
    headers?: Record<string, string>,
  ): Promise<WebResourceMetadata> {
    let hash: string | null = null

    let response: Response
    response = await fetch(url, {
      method: "HEAD",
      headers: headers,
    })

    let lastModified: Date | null = null
    try {
      const lastModifiedHeader = response.headers.get("last-modified")
      if (lastModifiedHeader) {
        lastModified = new Date(lastModifiedHeader)
      }
    } catch {
      lastModified = null
    }

    const etag = response.headers.get("etag")

    const failedHeadRequest = !response.ok && response.status < 500
    if (failedHeadRequest || (lastModified === null && etag === null)) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      response = await fetch(url, {
        method: "GET",
        headers: headers,
      })

      if (response.ok) {
        const hashStream = crypto.createHash("sha256")
        const reader = response.body?.getReader()
        if (reader) {
          let done = false
          while (!done) {
            const { value, done: readerDone } = await reader.read()
            if (value) {
              hashStream.update(value)
            }
            done = readerDone
          }
          hash = hashStream.digest("hex")
        }
      }
    }

    return {
      hash,
      lastModified,
      etag,
    }
  }
}
