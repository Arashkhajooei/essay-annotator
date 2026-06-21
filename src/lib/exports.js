import { supabase } from './supabase.js'

/* ---------- data ---------- */
export async function fetchExportData(scope, userId) {
  let q = supabase
    .from('annotations')
    .select('*, labels(name, color), profiles(email, display_name)')
    .order('start_offset')
  if (scope === 'mine') q = q.eq('user_id', userId)
  let sq = supabase
    .from('essay_scores')
    .select('essay_id, user_id, score, prompt_adherence, task_validity, coherence_local, coherence_global')
  if (scope === 'mine') sq = sq.eq('user_id', userId)
  const [{ data: anns, error: e1 }, { data: essays, error: e2 }, { data: scores, error: e3 }] =
    await Promise.all([
      q,
      supabase.from('essays').select('id, title, prompt, content').order('created_at'),
      sq,
    ])
  if (e1) throw e1
  if (e2) throw e2
  if (e3) throw e3
  return { anns: anns || [], essays: essays || [], scores: scores || [] }
}

/* group annotations into (essay × annotator) documents */
export function buildDocs({ anns, essays, scores = [] }) {
  const essayById = Object.fromEntries(essays.map((e) => [e.id, e]))
  const rubricByKey = Object.fromEntries((scores || []).map((s) => [`${s.essay_id}::${s.user_id}`, s]))
  const groups = new Map()
  for (const a of anns) {
    const essay = essayById[a.essay_id]
    if (!essay) continue
    const key = `${a.essay_id}::${a.user_id}`
    if (!groups.has(key)) {
      groups.set(key, {
        essay_id: a.essay_id,
        title: essay.title,
        prompt: essay.prompt,
        text: essay.content,
        annotator: a.profiles?.display_name || a.profiles?.email || a.user_id,
        annotator_id: a.user_id,
        score: rubricByKey[key]?.score ?? null,
        prompt_adherence: rubricByKey[key]?.prompt_adherence ?? null,
        task_validity: rubricByKey[key]?.task_validity ?? null,
        coherence_local: rubricByKey[key]?.coherence_local ?? null,
        coherence_global: rubricByKey[key]?.coherence_global ?? null,
        spans: [],
      })
    }
    groups.get(key).spans.push({
      start: a.start_offset,
      end: a.end_offset,
      label: a.labels?.name || 'Unknown',
      text: a.text,
      note: a.note,
    })
  }
  return [...groups.values()]
}

/* ---------- tokenization (whitespace, offset-preserving) ---------- */
function tokenize(text) {
  const toks = []
  const re = /\S+/g
  let m
  while ((m = re.exec(text))) toks.push({ t: m[0], s: m.index, e: m.index + m[0].length })
  return toks
}

const tagName = (label) => label.replace(/\s+/g, '_')

function bioTags(tokens, spans) {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  return tokens.map((tok) => {
    const span = sorted.find((sp) => tok.s < sp.end && tok.e > sp.start)
    if (!span) return 'O'
    const isFirst = !tokens.some(
      (other) => other.s < tok.s && other.s < span.end && other.e > span.start
    )
    return `${isFirst ? 'B' : 'I'}-${tagName(span.label)}`
  })
}

/* ---------- formats ---------- */
const naText = (v) => (v == null || v === '' ? 'N/A' : v)
const naBool = (b) => (b == null ? 'N/A' : b ? 'Yes' : 'No')
const rubricOf = (d) => ({
  holistic_score: naText(d.score),
  prompt_adherence: naText(d.prompt_adherence),
  task_validity: naText(d.task_validity),
  coherence_local: naBool(d.coherence_local),
  coherence_global: naBool(d.coherence_global),
})

export function toJSON(docs) {
  // nested, human-readable: one object per essay with all annotators
  const byEssay = new Map()
  for (const d of docs) {
    if (!byEssay.has(d.essay_id)) {
      byEssay.set(d.essay_id, {
        essay_id: d.essay_id,
        title: d.title,
        prompt: d.prompt,
        text: d.text,
        annotations: [],
      })
    }
    byEssay.get(d.essay_id).annotations.push({
      annotator: d.annotator,
      ...rubricOf(d),
      spans: d.spans,
    })
  }
  return JSON.stringify([...byEssay.values()], null, 2)
}

export function toJSONL(docs) {
  // spaCy / doccano span format: {"text": ..., "label": [[start, end, "Label"], ...]}
  return docs
    .map((d) =>
      JSON.stringify({
        id: d.essay_id,
        annotator: d.annotator,
        ...rubricOf(d),
        text: d.text,
        label: d.spans.map((s) => [s.start, s.end, s.label]),
      })
    )
    .join('\n')
}

export function toCSV(docs) {
  // Kaggle Feedback Prize style discourse table
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [
    'essay_id,essay_title,annotator,holistic_score,prompt_adherence,task_validity,coherence_local,coherence_global,discourse_type,discourse_start,discourse_end,discourse_text,discourse_note',
  ]
  for (const d of docs)
    for (const s of d.spans)
      rows.push(
        [
          esc(d.essay_id), esc(d.title), esc(d.annotator),
          esc(naText(d.score)), esc(naText(d.prompt_adherence)), esc(naText(d.task_validity)),
          esc(naBool(d.coherence_local)), esc(naBool(d.coherence_global)),
          esc(s.label), s.start, s.end, esc(s.text), esc(s.note ?? ''),
        ].join(',')
      )
  return rows.join('\n')
}

export function toCoNLL(docs) {
  // token<TAB>BIO-tag, blank line between documents
  const out = []
  for (const d of docs) {
    out.push(`# essay_id = ${d.essay_id}`)
    out.push(`# annotator = ${d.annotator}`)
    out.push(`# holistic_score = ${naText(d.score)}`)
    out.push(`# prompt_adherence = ${naText(d.prompt_adherence)}`)
    out.push(`# task_validity = ${naText(d.task_validity)}`)
    out.push(`# coherence_local = ${naBool(d.coherence_local)}`)
    out.push(`# coherence_global = ${naBool(d.coherence_global)}`)
    const tokens = tokenize(d.text)
    const tags = bioTags(tokens, d.spans)
    tokens.forEach((tok, i) => out.push(`${tok.t}\t${tags[i]}`))
    out.push('')
  }
  return out.join('\n')
}

export function toHuggingFace(docs) {
  // token-classification JSONL: {"tokens": [...], "tags": [...]} — load with datasets.load_dataset("json", ...)
  return docs
    .map((d) => {
      const tokens = tokenize(d.text)
      return JSON.stringify({
        id: d.essay_id,
        annotator: d.annotator,
        ...rubricOf(d),
        tokens: tokens.map((t) => t.t),
        tags: bioTags(tokens, d.spans),
      })
    })
    .join('\n')
}

export function toPromptCompletion(docs) {
  // instruction-tuning JSONL for LLM fine-tuning (chat format)
  return docs
    .map((d) =>
      JSON.stringify({
        messages: [
          {
            role: 'system',
            content:
              'You are an expert writing analyst. Segment the essay into rhetorical moves (Lead, Position, Claim, Counterclaim, Rebuttal, Evidence, Concluding Statement). Answer as a JSON list of {"label", "text"} objects in document order.',
          },
          { role: 'user', content: d.text },
          {
            role: 'assistant',
            content: JSON.stringify(d.spans.map((s) => ({ label: s.label, text: s.text }))),
          },
        ],
        metadata: rubricOf(d),
      })
    )
    .join('\n')
}

/* ---------- download ---------- */
export function download(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const FORMATS = [
  {
    key: 'json',
    glyph: '{}',
    tint: '#7da6f2',
    name: 'JSON (nested)',
    ext: '.json',
    mime: 'application/json',
    desc: 'Human-readable: every essay with all annotators and their labeled spans. Best for archiving and inspection.',
    build: toJSON,
  },
  {
    key: 'jsonl',
    glyph: '≡',
    tint: '#2dd4bf',
    name: 'JSONL spans',
    ext: '.jsonl',
    mime: 'application/jsonl',
    desc: 'One document per line with [start, end, label] spans — the spaCy / doccano format for span models.',
    build: toJSONL,
  },
  {
    key: 'csv',
    glyph: '▤',
    tint: '#4ade80',
    name: 'CSV (discourse table)',
    ext: '.csv',
    mime: 'text/csv',
    desc: 'Kaggle Feedback-Prize style table: one row per discourse element. Opens in Excel / pandas.',
    build: toCSV,
  },
  {
    key: 'conll',
    glyph: 'B-I',
    tint: '#fcd34d',
    name: 'CoNLL BIO',
    ext: '.conll',
    mime: 'text/plain',
    desc: 'Token-per-line with B-/I-/O tags — the classic format for BERT-style token classification.',
    build: toCoNLL,
  },
  {
    key: 'hf',
    glyph: 'HF',
    tint: '#f472b6',
    name: 'HuggingFace tokens',
    ext: '.jsonl',
    mime: 'application/jsonl',
    desc: 'JSONL of {tokens, tags} ready for datasets.load_dataset("json") and transformer fine-tuning.',
    build: toHuggingFace,
  },
  {
    key: 'llm',
    glyph: '✦',
    tint: '#c084fc',
    name: 'LLM chat fine-tune',
    ext: '.jsonl',
    mime: 'application/jsonl',
    desc: 'Instruction-tuning chat messages (system / user / assistant) for fine-tuning LLMs to segment essays.',
    build: toPromptCompletion,
  },
]
