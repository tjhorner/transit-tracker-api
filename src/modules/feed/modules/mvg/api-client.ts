import { InternalServerErrorException, NotFoundException } from "@nestjs/common"

export interface MvgDeparture {
  plannedDepartureTime: number
  realtime: boolean
  delayInMinutes: number | null
  realtimeDepartureTime: number
  transportType: string
  label: string
  divaId: string
  network: string
  trainType: string
  destination: string
  cancelled: boolean
  sev: boolean
  platform: number | null
  platformChanged: boolean
  messages: any[]
  infos: any[]
  bannerHash: string
  occupancy: string
  stationGlobalId: string
  stopPointGlobalId: string
  lineId: string
  tripCode: number
}

export interface MvgStation {
  globalId: string
  name: string
  place: string
  latitude: number
  longitude: number
  type: string
  products: string[]
  tariffZones: string
  transportTypes: string[]
}

export interface MvgDeparturesOptions {
  limit?: number
  transportTypes?: string[]
}

export class MvgApiClient {
  constructor(readonly baseUrl: string) {}

  async getStation(globalId: string): Promise<MvgStation> {
    return this.fetchJson(`/stations/${encodeURIComponent(globalId)}`)
  }

  async getNearbyStations(
    latitude: number,
    longitude: number,
  ): Promise<MvgStation[]> {
    return this.fetchJson(
      `/stations/nearby?latitude=${latitude}&longitude=${longitude}`,
    )
  }

  async getDepartures(
    globalId: string,
    options: MvgDeparturesOptions = {},
  ): Promise<MvgDeparture[]> {
    let url = `/departures?globalId=${encodeURIComponent(globalId)}`
    if (options.limit !== undefined) {
      url += `&limit=${options.limit}`
    }
    if (options.transportTypes !== undefined) {
      url += `&transportTypes=${options.transportTypes.join(",")}`
    }
    return this.fetchJson(url)
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${url}`)
    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundException(`Resource not found: ${url}`)
      }
      throw new InternalServerErrorException(
        `MVG API request failed: ${response.status} ${response.statusText}`,
      )
    }
    return response.json() as Promise<T>
  }
}
