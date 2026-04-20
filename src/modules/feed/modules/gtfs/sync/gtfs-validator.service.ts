import { Injectable, Logger } from "@nestjs/common"
import { parseFile } from "fast-csv"
import fs from "node:fs"
import { CSV_PARSE_OPTIONS } from "./const"

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
    const dates = await Promise.all([
      this.findEarliestDateInFile(directory, "calendar.txt", "start_date"),
      this.findEarliestDateInFile(directory, "calendar_dates.txt", "date"),
    ])

    const validDates = dates.filter((date): date is Date => date !== null)

    if (validDates.length === 0) {
      return {
        isValid: false,
        errors: [
          "No valid service dates found in calendar.txt or calendar_dates.txt",
        ],
      }
    }

    const earliestServiceDate = new Date(
      Math.min(...validDates.map((d) => d.getTime())),
    )

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

  private async findEarliestDateInFile(
    directory: string,
    filename: string,
    dateField: string,
  ): Promise<Date | null> {
    const filePath = `${directory}/${filename}`
    if (!fs.existsSync(filePath)) return null

    let earliestDate: Date | null = null

    try {
      for await (const row of parseFile(filePath, CSV_PARSE_OPTIONS)) {
        if (!row[dateField]) {
          this.logger.warn(
            `Missing ${dateField} in ${filename} row: ${JSON.stringify(row)}`,
          )
          continue
        }

        const date = this.parseDate(row[dateField])
        if (date && (!earliestDate || date < earliestDate)) {
          earliestDate = date
        }
      }
    } catch (error) {
      this.logger.error(
        `Error reading ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return earliestDate
  }

  private parseDate(dateStr: string): Date | null {
    if (!/^\d{8}$/.test(dateStr)) return null
    const year = parseInt(dateStr.slice(0, 4), 10)
    const month = parseInt(dateStr.slice(4, 6), 10) - 1
    const day = parseInt(dateStr.slice(6, 8), 10)
    return new Date(year, month, day)
  }
}
