// Reading .txt/.text/.md files into essay {title, text} objects.

export function titleFromFilename(name) {
  return (
    name
      .replace(/\.(txt|text|md)$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled essay'
  )
}

export function normalizeEssayText(raw) {
  let t = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ').trim()
  // Files with single newlines between paragraphs: promote each line break to a
  // paragraph break so the annotator renders them as separate paragraphs.
  if (!/\n\s*\n/.test(t)) t = t.replace(/\n+/g, '\n\n')
  return t
}

export async function readTextFiles(fileList) {
  const files = [...fileList].filter(
    (f) => /\.(txt|text|md)$/i.test(f.name) || (f.type || '').startsWith('text/')
  )
  return Promise.all(
    files.map(async (f) => ({
      name: f.name,
      title: titleFromFilename(f.name),
      text: normalizeEssayText(await f.text()),
    }))
  )
}
