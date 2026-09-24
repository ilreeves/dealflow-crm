// Supabase Storage rejects object keys containing many ordinary filename
// characters — en-dashes, accents, brackets, emoji… ("Invalid key") — so an
// upload of "Deck – Série B [final].pdf" fails outright. Every upload builds
// its storage PATH from this instead of the raw file.name. The display-name
// columns (deal_files.name, company_decks.file_name, …) keep the original, so
// users still see exactly what they uploaded.

// Longest base name kept. Keys can be ~1KB, but the path already carries an
// entity id + timestamp prefix, and nobody reads the key itself.
const MAX_BASE_LEN = 100

export function safeStorageName(name: string): string {
  // NFKD splits "é" into "e" + a combining accent (and folds compatibility
  // forms like "ﬁ" → "fi"); dropping the combining marks keeps the readable
  // ASCII letter instead of turning it into "_".
  const ascii = name.trim().normalize('NFKD').replace(/\p{M}/gu, '')

  // Split off the extension so it survives sanitizing and truncation intact —
  // the viewer and the download both key off it (.pdf).
  const dot = ascii.lastIndexOf('.')
  const rawExt = dot >= 0 ? ascii.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 10) : ''
  const rawBase = dot >= 0 && rawExt ? ascii.slice(0, dot) : ascii

  const base = rawBase
    .replace(/[^A-Za-z0-9._() -]/g, '_')
    .replace(/_+/g, '_')
    .replace(/ {2,}/g, ' ')
    // Leading/trailing dots, spaces and underscores read as junk (or as a
    // hidden file) — trim them.
    .replace(/^[ ._]+|[ ._]+$/g, '')
    .slice(0, MAX_BASE_LEN)
    .replace(/[ ._]+$/, '')

  return `${base || 'file'}${rawExt ? `.${rawExt}` : ''}`
}
