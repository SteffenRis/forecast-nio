// Hand-rolled RFC-4180-ish CSV tokenizer. No dependency (the project keeps deps
// minimal) and no domain knowledge — it only turns raw text into a string matrix.
// The importer's column/field meaning is applied later, in columnMapping/buildActuals.

export interface ParsedCsv {
  /** Header cells of the first non-blank record, BOM-stripped. */
  header: string[]
  /** Data records below the header. Ragged rows are kept as-is (callers index by
   *  the mapped column, and short rows read as '' for a missing cell). */
  rows: string[][]
}

export interface CsvParseResult {
  ok: boolean
  data?: ParsedCsv
  /** Structural problems the upload step explains to the user. */
  error?: 'empty' | 'header-only'
}

/** Tokenize CSV text into a matrix of records. A single-pass state machine over
 *  characters handles quoted fields, embedded commas/newlines, `""` escaping and
 *  the three newline conventions (CRLF / LF / CR). A leading UTF-8 BOM is stripped.
 *  Fully blank records (a single empty unquoted field) are dropped. */
export function tokenizeCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let fieldWasQuoted = false

  const endField = () => {
    record.push(field)
    field = ''
    fieldWasQuoted = false
  }
  const endRecord = () => {
    endField()
    // Skip a record that is a single empty, never-quoted field (a blank line).
    if (!(record.length === 1 && record[0] === '' && !fieldWasQuoted)) {
      records.push(record)
    }
    record = []
  }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++ // consume the escaped quote
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
      fieldWasQuoted = true
    } else if (c === ',') {
      endField()
    } else if (c === '\n') {
      endRecord()
    } else if (c === '\r') {
      endRecord()
      if (src[i + 1] === '\n') i++ // consume the LF of a CRLF pair
    } else {
      field += c
    }
  }
  // Flush the trailing record unless the file ended on a clean newline (no buffer).
  if (field !== '' || fieldWasQuoted || record.length > 0) endRecord()
  return records
}

/** Parse CSV text into a header + data rows. Returns 'empty' when there are no
 *  records and 'header-only' when there's a header but no data rows. */
export function parseCsv(text: string): CsvParseResult {
  const records = tokenizeCsv(text)
  if (records.length === 0) return { ok: false, error: 'empty' }
  const [header, ...rows] = records
  if (rows.length === 0) return { ok: false, error: 'header-only' }
  return { ok: true, data: { header: header.map((h) => h.trim()), rows } }
}
