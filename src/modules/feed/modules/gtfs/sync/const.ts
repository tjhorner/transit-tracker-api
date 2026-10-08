export const CSV_PARSE_OPTIONS = {
  headers: true,
  ltrim: true,
  ignoreEmpty: true,
  // Some feeds have rows with more values than header columns; drop the extras
  discardUnmappedColumns: true,
}
