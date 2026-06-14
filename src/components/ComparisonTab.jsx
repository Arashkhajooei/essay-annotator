import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { toast } from '../lib/toast.js'
import { computeComparison, getParagraphs } from '../lib/agreement.js'

const RATER_COLORS = ['#7da6f2', '#f472b6', '#4ade80', '#fcd34d', '#c084fc', '#2dd4bf', '#fb923c', '#60a5fa']
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const kap = (x) => (x == null ? '—' : x.toFixed(3))

export default function ComparisonTab() {
  const [essays, setEssays] = useState(null)
  const [essayId, setEssayId] = useState('')
  const [data, setData] = useState(null) // { essay, raters, spansByRater, labelColor, comparison }
  const [loading, setLoading] = useState(false)
  const [showRaters, setShowRaters] = useState(false)

  useEffect(() => {
    supabase
      .from('essays')
      .select('id, title')
      .order('created_at')
      .then(({ data, error }) => {
        if (error) return toast(error.message, 'error')
        setEssays(data || [])
      })
  }, [])

  async function loadEssay(id) {
    setEssayId(id)
    setData(null)
    setShowRaters(false)
    if (!id) return
    setLoading(true)
    const [{ data: essay, error: e1 }, { data: anns, error: e2 }, { data: labels, error: e3 }] =
      await Promise.all([
        supabase.from('essays').select('*').eq('id', id).single(),
        supabase
          .from('annotations')
          .select('start_offset, end_offset, user_id, labels(name, color), profiles(display_name, email)')
          .eq('essay_id', id)
          .order('start_offset'),
        supabase.from('labels').select('name, color, sort_order').order('sort_order'),
      ])
    setLoading(false)
    if (e1 || e2 || e3) return toast((e1 || e2 || e3).message, 'error')

    const labelColor = Object.fromEntries((labels || []).map((l) => [l.name, l.color]))
    const labelOrder = (labels || []).map((l) => l.name)

    const raterMap = new Map()
    const spansByRater = {}
    for (const a of anns || []) {
      const rid = a.user_id
      if (!raterMap.has(rid)) {
        raterMap.set(rid, a.profiles?.display_name || a.profiles?.email || rid)
        spansByRater[rid] = []
      }
      spansByRater[rid].push({ start: a.start_offset, end: a.end_offset, label: a.labels?.name || 'Unknown' })
    }
    const raters = [...raterMap.entries()].map(([rid, name], i) => ({
      id: rid,
      name,
      color: RATER_COLORS[i % RATER_COLORS.length],
    }))
    const comparison = computeComparison({ text: essay.content, raters, spansByRater, labelOrder })
    setData({ essay, raters, spansByRater, labelColor, comparison })
  }

  if (!essays) return <div className="spinner" />

  return (
    <>
      <div className="field" style={{ maxWidth: 520 }}>
        <label>Essay</label>
        <select className="input" value={essayId} onChange={(e) => loadEssay(e.target.value)}>
          <option value="">Select an essay to compare raters…</option>
          {essays.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="spinner" />}
      {data && (
        <ComparisonView {...data} showRaters={showRaters} setShowRaters={setShowRaters} />
      )}
    </>
  )
}

const raterName = (raters, id) => raters.find((r) => r.id === id)?.name || '?'

function ComparisonView({ essay, raters, spansByRater, labelColor, comparison, showRaters, setShowRaters }) {
  const c = comparison
  const paras = useMemo(() => getParagraphs(essay.content), [essay])

  if (raters.length < 2) {
    return (
      <div className="empty" style={{ marginTop: 18 }}>
        <div className="big">👥</div>
        {raters.length === 0
          ? 'No one has annotated this essay yet.'
          : `Only ${raters[0].name} has annotated this essay.`}
        <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-3)' }}>
          Inter-annotator comparison needs at least two raters on the same essay.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="hl-row">
        <Metric label="Raters" value={raters.length} />
        <Metric label="Overall agreement" value={pct(c.overall)} hint="all tokens" />
        <Metric label="On labeled text" value={pct(c.overallLabeled)} hint="≥1 rater tagged" />
        <Metric label={c.kappaName || 'κ'} value={kap(c.kappa)} hint="chance-corrected" />
      </div>

      <div className="legend" style={{ marginBottom: 16 }}>
        {raters.map((r) => (
          <span key={r.id} className="legend-chip" style={{ '--c': r.color }}>
            <span className="dot" />
            {r.name} · {(spansByRater[r.id] || []).length} spans
          </span>
        ))}
      </div>

      <div className="panel-card" style={{ marginBottom: 18 }}>
        <h3>Agreement overlay</h3>
        <div className="agr-legend">
          <span><i className="sw agr-agree" /> all agree</span>
          <span><i className="sw agr-conflict" /> labeled, different labels</span>
          <span><i className="sw agr-gap" /> only some labeled — miss / extra</span>
        </div>
        <div className="essay-text cmp-essay">
          {paras.map((p, i) => (
            <OverlayParagraph key={i} para={p} text={essay.content} segments={c.segments} raters={raters} />
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-dark" onClick={() => setShowRaters((v) => !v)}>
            {showRaters ? 'Hide per-rater view' : 'Show each rater separately'}
          </button>
        </div>
        {showRaters && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {raters.map((r) => (
              <div key={r.id}>
                <div className="cmp-rater-head">
                  <span className="dot" style={{ background: r.color }} />
                  {r.name}
                </div>
                <div className="essay-text cmp-essay">
                  {paras.map((p, i) => (
                    <RaterParagraph
                      key={i}
                      para={p}
                      text={essay.content}
                      spans={spansByRater[r.id] || []}
                      labelColor={labelColor}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel-card" style={{ marginBottom: 18 }}>
        <h3>Per-label agreement</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Label</th>
              {raters.map((r) => (
                <th key={r.id}>{r.name}</th>
              ))}
              <th>Overlap (Jaccard)</th>
            </tr>
          </thead>
          <tbody>
            {c.perLabel.length === 0 && (
              <tr>
                <td colSpan={raters.length + 2} className="cell-dim">
                  No labels applied yet.
                </td>
              </tr>
            )}
            {c.perLabel.map((row) => (
              <tr key={row.label}>
                <td>
                  <span className="legend-chip" style={{ '--c': labelColor[row.label] || '#888' }}>
                    <span className="dot" />
                    {row.label}
                  </span>
                </td>
                {raters.map((r) => (
                  <td key={r.id} className="cell-dim">
                    {row.counts[r.id] || 0}
                  </td>
                ))}
                <td>
                  <AgreeChip v={row.jaccard} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ color: 'var(--text-3)', fontSize: 11.5, marginTop: 8 }}>
          Counts are word-tokens each rater tagged with that label. Jaccard = overlap ÷ union of those
          tokens (1.0 = identical, 0 = no shared text).
        </div>
      </div>

      {raters.length > 2 && (
        <div className="panel-card" style={{ marginBottom: 18 }}>
          <h3>Pairwise agreement</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Rater A</th>
                <th>Rater B</th>
                <th>Agreement</th>
              </tr>
            </thead>
            <tbody>
              {c.pairwise.map((p, i) => (
                <tr key={i}>
                  <td>{raterName(raters, p.a)}</td>
                  <td>{raterName(raters, p.b)}</td>
                  <td>
                    <AgreeChip v={p.agreement} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel-card">
        <h3>Where they differ ({c.disagreements.length})</h3>
        {c.disagreements.length === 0 ? (
          <div className="cell-dim" style={{ fontSize: 13 }}>
            No disagreements — raters tagged the same text with the same labels. 🎯
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {c.disagreements.map((d, i) => (
              <div key={i} className={`diff-item diff-${d.state}`}>
                <div className="diff-meta">
                  <span className={`chip ${d.state === 'gap' ? 'amber' : 'blue'}`}>
                    {d.state === 'gap' ? 'miss / extra' : 'different label'}
                  </span>
                  {raters.map((r) => (
                    <span key={r.id} className="diff-rater">
                      <b style={{ color: r.color }}>{r.name}:</b> {d.perRater[r.id] || '—'}
                    </span>
                  ))}
                </div>
                <div className="diff-text">“{d.text.trim()}”</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function Metric({ label, value, hint }) {
  return (
    <div className="hl-item">
      <div className="hl-label">{label}</div>
      <div className="hl-value">
        {value}
        {hint && <span className="hl-unit">{hint}</span>}
      </div>
    </div>
  )
}

function AgreeChip({ v }) {
  if (v == null) return <span className="cell-dim">—</span>
  const cls = v >= 0.8 ? 'green' : v >= 0.5 ? 'amber' : 'red'
  return <span className={`chip ${cls}`}>{Math.round(v * 100)}%</span>
}

/* essay paragraph colored by agreement state; tooltip shows each rater's label */
function OverlayParagraph({ para, text, segments, raters }) {
  const nodes = []
  for (const seg of segments) {
    if (seg.s >= para.end || seg.e <= para.start) continue
    const s = Math.max(seg.s, para.start)
    const e = Math.min(seg.e, para.end)
    if (e <= s) continue
    const slice = text.slice(s, e)
    if (seg.state === 'none') {
      nodes.push(<span key={s}>{slice}</span>)
      continue
    }
    const title = raters.map((r) => `${r.name}: ${seg.perRater[r.id] || '—'}`).join('   ·   ')
    nodes.push(
      <span key={s} className={`agr agr-${seg.state}`} title={title}>
        {slice}
      </span>
    )
  }
  return <p>{nodes}</p>
}

/* essay paragraph with one rater's spans in label colors (read-only) */
function RaterParagraph({ para, text, spans, labelColor }) {
  const inPara = spans
    .filter((a) => a.start < para.end && a.end > para.start)
    .sort((x, y) => x.start - y.start)
  const nodes = []
  let cursor = para.start
  for (const a of inPara) {
    const s = Math.max(a.start, para.start, cursor)
    const e = Math.min(a.end, para.end)
    if (e <= cursor) continue
    if (s > cursor) nodes.push(<span key={`t${cursor}`}>{text.slice(cursor, s)}</span>)
    nodes.push(
      <span key={`h${s}`} className="hl" style={{ '--c': labelColor[a.label] || '#0095f6' }} title={a.label}>
        {text.slice(s, e)}
      </span>
    )
    cursor = e
  }
  if (cursor < para.end) nodes.push(<span key={`t${cursor}`}>{text.slice(cursor, para.end)}</span>)
  return <p>{nodes}</p>
}
