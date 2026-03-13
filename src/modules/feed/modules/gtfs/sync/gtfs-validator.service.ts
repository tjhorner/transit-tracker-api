import { Injectable, Logger } from "@nestjs/common"
import { parseFile } from "fast-csv"
import stream from "node:stream/promises"

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

@Injectable()
export class GtfsValidatorService {
  private readonly logger = new Logger(GtfsValidatorService.name)

  async validateFeed(directory: string): Promise<ValidationResult> {
    const results: ValidationResult[] = await Promise.all([
      this.validateServiceDates(directory),
    ])

    const isValid = results.every((result) => result.isValid)
    const errors = results.flatMap((result) => result.errors)

    return { isValid, errors }
  }

  private async validateServiceDates(
    directory: string,
  ): Promise<ValidationResult> {
    let earliestServiceDate = new Date("9999-12-31")

    const calendarPath = `${directory}/calendar.txt`
    const calendarStream = stream.finished(
      parseFile(calendarPath, { headers: true, ignoreEmpty: true })
        .on("error", (error) => {
          this.logger.error(`Error reading calendar.txt: ${error.message}`)
        })
        .on("data", (row) => {
          if (!row.start_date) {
            this.logger.warn(
              `Missing start_date in calendar.txt row: ${JSON.stringify(row)}`,
            )
            return
          }
          const startDate = this.parseDate(row.start_date)
          if (
            startDate &&
            (!earliestServiceDate || startDate < earliestServiceDate)
          ) {
            earliestServiceDate = startDate
          }
        }),
    )

    const calendarDatesPath = `${directory}/calendar_dates.txt`
    const calendarDatesStream = stream.finished(
      parseFile(calendarDatesPath, { headers: true, ignoreEmpty: true })
        .on("error", (error) => {
          this.logger.error(
            `Error reading calendar_dates.txt: ${error.message}`,
          )
        })
        .on("data", (row) => {
          if (!row.date) {
            this.logger.warn(
              `Missing date in calendar_dates.txt row: ${JSON.stringify(row)}`,
            )
            return
          }
          const date = this.parseDate(row.date)
          if (date && (!earliestServiceDate || date < earliestServiceDate)) {
            earliestServiceDate = date
          }
        }),
    )

    await Promise.all([calendarStream, calendarDatesStream])

    if (earliestServiceDate.getFullYear() === 9999) {
      return {
        isValid: false,
        errors: [
          "No valid service dates found in calendar.txt or calendar_dates.txt",
        ],
      }
    }

    // This technically isn't timezone-aware, but I don't really care enough
    // because this will happen so infrequently, lol
    const today = new Date()
    if (earliestServiceDate > today) {
      return {
        isValid: false,
        errors: [
          `Earliest service date (${earliestServiceDate.toISOString().slice(0, 10)}) is in the future`,
        ],
      }
    }

    return { isValid: true, errors: [] }
  }

  private parseDate(dateStr: string): Date | null {
    if (!/^\d{8}$/.test(dateStr)) return null
    const year = parseInt(dateStr.slice(0, 4), 10)
    const month = parseInt(dateStr.slice(4, 6), 10) - 1
    const day = parseInt(dateStr.slice(6, 8), 10)
    return new Date(year, month, day)
  }
}
