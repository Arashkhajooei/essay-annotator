/* Minimal RFC 4180 CSV parser — handles quoted fields, embedded commas/newlines,
 * and "" escapes. No dependencies. */
export function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/* Parse into an array of {header: value} objects (first non-empty row = headers). */
export function parseCSVObjects(text) {
  const rows = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''))
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const o = {}
    headers.forEach((h, i) => { o[h] = r[i] ?? '' })
    return o
  })
}
