import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { toast } from '../lib/toast.js'

/* Split text into paragraphs (blank-line separated) with absolute char offsets. */
function getParagraphs(text) {
  const out = []
  let idx = 0
  for (const part of text.split(/(\n{2,})/)) {
    if (part.length && !/^\n{2,}$/.test(part)) {
      out.push({ start: idx, end: idx + part.length, text: part })
    }
    idx += part.length
  }
  return out
}

/* Char offset of (container, offset) inside a paragraph element's text. */
function offsetInParagraph(pEl, container, offset) {
  if (container.nodeType === Node.ELEMENT_NODE) {
    // offset = index of child node; sum text before it
    let sum = 0
    const walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT)
    const stopNode = container.childNodes[offset] || null
    let node
    while ((node = walker.nextNode())) {
      if (stopNode && (stopNode === node || stopNode.contains(node))) break
      sum += node.textContent.length
    }
    return sum
  }
  let sum = 0
  const walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    if (node === container) return sum + offset
    sum += node.textContent.length
  }
  return sum
}

function findPara(node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  return el ? el.closest('p[data-pstart]') : null
}

const boolToStr = (b) => (b === true ? 'yes' : b === false ? 'no' : '')
const strToBool = (s) => (s === 'yes' ? true : s === 'no' ? false : null)

export default function Annotator({ essayId, user }) {
  const [essay, setEssay] = useState(null)
  const [labels, setLabels] = useState([])
  const [anns, setAnns] = useState([])
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [rubric, setRubric] = useState({})
  const [loadError, setLoadError] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  // palette: {mode:'create', start, end, x, y} | {mode:'edit', ann, x, y}
  const [palette, setPalette] = useState(null)
  const [note, setNote] = useState('')
  const wrapRef = useRef(null)
  const savingRef = useRef(false)

  const labelById = useMemo(() => Object.fromEntries(labels.map((l) => [l.id, l])), [labels])

  const load = useCallback(async () => {
    const [{ data: e, error: ee }, { data: ls }, { data: as }, { data: sub }, { data: sc }] =
      await Promise.all([
        supabase.from('essays').select('*').eq('id', essayId).maybeSingle(),
        supabase
          .from('labels')
          .select('*')
          .eq('is_active', true)
          .order('sort_order')
          .order('name'),
        supabase
          .from('annotations')
          .select('*')
          .eq('essay_id', essayId)
          .eq('user_id', user.id)
          .order('start_offset'),
        supabase
          .from('essay_submissions')
          .select('essay_id')
          .eq('essay_id', essayId)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('essay_scores')
          .select('score, prompt_adherence, task_validity, coherence_local, coherence_global')
          .eq('essay_id', essayId)
          .eq('user_id', user.id)
          .maybeSingle(),
      ])
    if (ee || !e) {
      setLoadError(ee?.message || 'Essay not found')
      return
    }
    setEssay(e)
    setLabels(ls || [])
    setAnns(as || [])
    setIsSubmitted(!!sub)
    setRubric(sc || {})
  }, [essayId, user.id])

  useEffect(() => {
    load()
  }, [load])

  const paragraphs = useMemo(() => (essay ? getParagraphs(essay.content) : []), [essay])

  /* ---------- selection handling ---------- */
  function handleMouseUp() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const pStart = findPara(range.startContainer)
    const pEnd = findPara(range.endContainer)
    if (!pStart || !pEnd) return

    let a =
      parseInt(pStart.dataset.pstart, 10) +
      offsetInParagraph(pStart, range.startContainer, range.startOffset)
    let b =
      parseInt(pEnd.dataset.pstart, 10) +
      offsetInParagraph(pEnd, range.endContainer, range.endOffset)
    if (a > b) [a, b] = [b, a]

    const text = essay.content
    while (a < b && /\s/.test(text[a])) a++
    while (b > a && /\s/.test(text[b - 1])) b--
    if (a >= b) return

    if (anns.some((x) => a < x.end_offset && b > x.start_offset)) {
      toast('That selection overlaps an existing annotation', 'error')
      sel.removeAllRanges()
      return
    }

    openPalette({ mode: 'create', start: a, end: b }, range.getBoundingClientRect())
    sel.removeAllRanges()
  }

  function openPalette(base, rect) {
    const wrapRect = wrapRef.current.getBoundingClientRect()
    const x = Math.min(Math.max(rect.left - wrapRect.left, 0), wrapRect.width - 240)
    const y = rect.bottom - wrapRect.top + 8
    setNote(base.mode === 'edit' ? base.ann.note || '' : '')
    setPalette({ ...base, x, y })
  }

  function tagParagraph(para, ev) {
    const text = essay.content
    let a = para.start
    let b = para.end
    while (a < b && /\s/.test(text[a])) a++
    while (b > a && /\s/.test(text[b - 1])) b--
    if (anns.some((x) => a < x.end_offset && b > x.start_offset)) {
      toast('This paragraph already contains annotations — select an untagged part instead', 'error')
      return
    }
    openPalette({ mode: 'create', start: a, end: b }, ev.currentTarget.getBoundingClientRect())
  }

  /* ---------- mutations ---------- */
  async function saveAnnotation(labelId) {
    if (savingRef.current) return // double-click guard
    savingRef.current = true
    try {
      await doSaveAnnotation(labelId)
    } finally {
      savingRef.current = false
    }
  }

  async function doSaveAnnotation(labelId) {
    if (palette.mode === 'create') {
      const { error } = await supabase.from('annotations').insert({
        essay_id: essayId,
        user_id: user.id,
        label_id: labelId,
        start_offset: palette.start,
        end_offset: palette.end,
        text: essay.content.slice(palette.start, palette.end),
        note: note.trim() || null,
      })
      if (error)
        return toast(
          error.code === '23505' ? 'This exact span is already tagged' : error.message,
          'error'
        )
    } else {
      const { error } = await supabase
        .from('annotations')
        .update({ label_id: labelId, note: note.trim() || null })
        .eq('id', palette.ann.id)
      if (error) return toast(error.message, 'error')
    }
    setPalette(null)
    load()
  }

  async function deleteAnnotation(id) {
    const { error } = await supabase.from('annotations').delete().eq('id', id)
    if (error) return toast(error.message, 'error')
    setPalette(null)
    load()
  }

  async function toggleSubmit() {
    if (isSubmitted) {
      const { error } = await supabase
        .from('essay_submissions')
        .delete()
        .eq('essay_id', essayId)
        .eq('user_id', user.id)
      if (error) return toast(error.message, 'error')
      toast('Reopened for editing')
    } else {
      const { error } = await supabase
        .from('essay_submissions')
        .insert({ essay_id: essayId, user_id: user.id })
      if (error) return toast(error.message, 'error')
      toast('✓ Annotation submitted')
    }
    load()
  }

  async function saveRubric(patch) {
    setRubric((cur) => ({ ...cur, ...patch }))
    const { error } = await supabase
      .from('essay_scores')
      .upsert({ essay_id: essayId, user_id: user.id, ...patch, updated_at: new Date().toISOString() })
    if (error) toast(error.message, 'error')
  }

  /* keyboard shortcuts: 1..9 picks a label while palette is open, Esc closes */
  useEffect(() => {
    if (!palette) return
    function onKey(e) {
      if (e.key === 'Escape') setPalette(null)
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= labels.length) saveAnnotation(labels[n - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, labels, note])

  if (loadError)
    return (
      <div className="empty">
        <div className="big">🤔</div>
        {loadError} — <a href="#/essays">back to essays</a>
      </div>
    )
  if (!essay) return <div className="spinner" />

  /* ---------- render one paragraph with highlight segments ---------- */
  function renderParagraph(para, i) {
    const segs = []
    let cursor = para.start
    const inPara = anns
      .filter((a) => a.start_offset < para.end && a.end_offset > para.start)
      .sort((x, y) => x.start_offset - y.start_offset)
    for (const a of inPara) {
      // clamp to cursor so duplicate/overlapping rows can never duplicate text
      const s = Math.max(a.start_offset, para.start, cursor)
      const e = Math.min(a.end_offset, para.end)
      if (e <= cursor) continue
      if (s > cursor) segs.push(<span key={`t${cursor}`}>{essay.content.slice(cursor, s)}</span>)
      const lbl = labelById[a.label_id]
      segs.push(
        <span
          key={a.id}
          className={`hl ${hoveredId === a.id ? 'hovered' : ''}`}
          style={{ '--c': lbl?.color || '#0095f6' }}
          data-ann={a.id}
          title={`${lbl?.name || '?'}${a.note ? ` — ${a.note}` : ''}`}
          onMouseEnter={() => setHoveredId(a.id)}
          onMouseLeave={() => setHoveredId(null)}
          onClick={(ev) => {
            ev.stopPropagation()
            openPalette({ mode: 'edit', ann: a }, ev.currentTarget.getBoundingClientRect())
          }}
        >
          {essay.content.slice(s, e)}
        </span>
      )
      cursor = e
    }
    if (cursor < para.end)
      segs.push(<span key={`t${cursor}`}>{essay.content.slice(cursor, para.end)}</span>)
    return (
      <p key={i} data-pstart={para.start}>
        <button
          className="para-tag"
          title="Tag this whole paragraph"
          aria-label="Tag this whole paragraph"
          onClick={(ev) => tagParagraph(para, ev)}
        />
        {segs}
      </p>
    )
  }

  const sortedAnns = [...anns].sort((a, b) => a.start_offset - b.start_offset)
  const taggedChars = anns.reduce((s, a) => s + (a.end_offset - a.start_offset), 0)
  const coverage = Math.min(100, Math.round((taggedChars / Math.max(essay.content.length, 1)) * 100))
  const canSubmit = !!(rubric.score && rubric.prompt_adherence && rubric.task_validity)

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <a href="#/essays" style={{ color: 'var(--text-2)', fontSize: 13 }}>
          ← Essays
        </a>
      </div>
      <div className="annotator">
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }} ref={wrapRef}>
          <div className="essay-paper">
            <h1>{essay.title}</h1>
            {essay.prompt && essay.prompt !== essay.title && <div className="essay-prompt">{essay.prompt}</div>}
            {(essay.native_language || essay.holistic_essay_score || essay.ordinal_score || essay.essay_word_count || essay.task) && (
              <div className="essay-meta">
                {essay.native_language && <span>L1: {essay.native_language}</span>}
                {essay.task && <span>Task: {essay.task}</span>}
                {essay.essay_word_count != null && <span>{essay.essay_word_count} words</span>}
                {essay.holistic_essay_score && <span>Ref holistic: {essay.holistic_essay_score}</span>}
                {essay.ordinal_score && <span>Ordinal: {essay.ordinal_score}</span>}
              </div>
            )}
            <div className="essay-text" onMouseUp={handleMouseUp}>
              {paragraphs.map(renderParagraph)}
            </div>
          </div>

          {palette && (
            <div className="palette" style={{ left: palette.x, top: palette.y }}>
              <div className="palette-title">
                {palette.mode === 'create' ? 'Tag as…' : 'Change label'}
              </div>
              {labels.map((l, i) => (
                <button key={l.id} className="palette-item" onClick={() => saveAnnotation(l.id)}>
                  <span className="dot" style={{ background: l.color }} />
                  {l.name}
                  {i < 9 && <span className="key">{i + 1}</span>}
                </button>
              ))}
              <div className="palette-sep" />
              <input
                className="input"
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ margin: '2px 0', fontSize: 12, padding: '7px 10px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {palette.mode === 'edit' ? (
                  <button
                    className="btn btn-danger"
                    style={{ padding: '5px 10px', fontSize: 12 }}
                    onClick={() => deleteAnnotation(palette.ann.id)}
                  >
                    Delete
                  </button>
                ) : (
                  <span />
                )}
                <button
                  className="btn btn-dark"
                  style={{ padding: '5px 10px', fontSize: 12 }}
                  onClick={() => setPalette(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="side-panel">
          <div className="panel-card">
            <h3>Labels</h3>
            <div className="legend">
              {labels.map((l) => (
                <span
                  key={l.id}
                  className="legend-chip"
                  style={{ '--c': l.color }}
                  title={l.description || ''}
                >
                  <span className="dot" />
                  {l.name}
                </span>
              ))}
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${coverage}%` }} />
            </div>
            <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 6 }}>
              {coverage}% of the text tagged · select text or hover a paragraph and click ¶
            </div>
          </div>

          <div className="panel-card">
            <h3>
              Your annotations ({anns.length})
            </h3>
            <div className="ann-list">
              {sortedAnns.length === 0 && (
                <div style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.6 }}>
                  Select any passage in the essay, then pick a rhetorical move from the palette.
                </div>
              )}
              {sortedAnns.map((a) => {
                const lbl = labelById[a.label_id]
                return (
                  <div
                    key={a.id}
                    className={`ann-item ${hoveredId === a.id ? 'hovered' : ''}`}
                    style={{ '--c': lbl?.color || '#0095f6' }}
                    onMouseEnter={() => setHoveredId(a.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => {
                      const el = wrapRef.current?.querySelector(`[data-ann="${a.id}"]`)
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }}
                  >
                    <div className="ann-label">
                      {lbl?.name || '?'}
                      <button
                        className="ann-x"
                        title="Delete annotation"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          deleteAnnotation(a.id)
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="ann-text">{a.text}</div>
                    {a.note && (
                      <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 3 }}>
                        💬 {a.note}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel-card">
            <h3>Essay rubric</h3>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Score (1–6)</label>
              <select
                className="input"
                value={rubric.score ?? ''}
                onChange={(ev) => saveRubric({ score: ev.target.value ? parseInt(ev.target.value, 10) : null })}
              >
                <option value="">— not scored —</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Prompt adherence</label>
              <select
                className="input"
                value={rubric.prompt_adherence ?? ''}
                onChange={(ev) => saveRubric({ prompt_adherence: ev.target.value || null })}
              >
                <option value="">—</option>
                {['Full', 'Partial', 'None'].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Task validity (content)</label>
              <select
                className="input"
                value={rubric.task_validity ?? ''}
                onChange={(ev) => saveRubric({ task_validity: ev.target.value || null })}
              >
                <option value="">—</option>
                {['On task', 'Off task'].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Coherence — local (sentence-to-sentence)</label>
              <select
                className="input"
                value={boolToStr(rubric.coherence_local)}
                onChange={(ev) => saveRubric({ coherence_local: strToBool(ev.target.value) })}
              >
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Coherence — global (alignment with thesis)</label>
              <select
                className="input"
                value={boolToStr(rubric.coherence_global)}
                onChange={(ev) => saveRubric({ coherence_global: strToBool(ev.target.value) })}
              >
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            {isSubmitted ? (
              <>
                <div style={{ color: 'var(--success)', fontWeight: 600, marginBottom: 10 }}>
                  ✓ Submitted{rubric.score ? ` · score ${rubric.score}` : ''} — thank you!
                </div>
                <button className="btn btn-dark" style={{ width: '100%' }} onClick={toggleSubmit}>
                  Reopen for editing
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn"
                  style={{ width: '100%' }}
                  disabled={anns.length === 0 || !canSubmit}
                  onClick={toggleSubmit}
                >
                  Submit annotation
                </button>
                {anns.length > 0 && !canSubmit && (
                  <div style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 6 }}>
                    Required before submit: score, prompt adherence, task validity.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
