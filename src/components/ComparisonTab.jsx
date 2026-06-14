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
  const [data, setData] = useState(null) // { essay, allRaters, spansByRater, labelColor, labelOrder, scoreByRater }
  const [loading, setLoading] = useState(false)

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
    if (!id) return
    setLoading(true)
    const [{ data: essay, error: e1 }, { data: anns, error: e2 }, { data: labels, error: e3 }, { data: scores, error: e4 }] =
      await Promise.all([
        supabase.from('essays').select('*').eq('id', id).single(),
        supabase
          .from('annotations')
          .select('start_offset, end_offset, user_id, labels(name, color), profiles(display_name, email)')
          .eq('essay_id', id)
          .order('start_offset'),
        supabase.from('labels').select('name, color, sort_order').order('sort_order'),
        supabase.from('essay_scores').select('user_id, score').eq('essay_id', id),
      ])
    setLoading(false)
    if (e1 || e2 || e3 || e4) return toast((e1 || e2 || e3 || e4).message, 'error')

    const labelColor = Object.fromEntries((labels || []).map((l) => [l.name, l.color]))
    const labelOrder = (labels || []).map((l) => l.name)
    const scoreByRater = Object.fromEntries((scores || []).map((s) => [s.user_id, s.score]))

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
    const allRaters = [...raterMap.entries()].map(([rid, name], i) => ({
      id: rid,
      name,
      color: RATER_COLORS[i % RATER_COLORS.length],
    }))
    setData({ essay, allRaters, spansByRater, labelColor, labelOrder, scoreByRater })
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
      {data && <ComparisonView key={data.essay.id} {...data} />}
    </>
  )
}

const raterName = (raters, id) => raters.find((r) => r.id === id)?.name || '?'

function ComparisonView({ essay, allRaters, spansByRater, labelColor, labelOrder, scoreByRater }) {
  const [selectedIds, setSelectedIds] = useState(() => allRaters.map((r) => r.id))
  const [showRaters, setShowRaters] = useState(false)
  const paras = useMemo(() => getParagraphs(essay.content), [essay])

  const { raters, comparison } = useMemo(() => {
    const sel = allRaters.filter((r) => selectedIds.includes(r.id))
    return {
      raters: sel,
      comparison:
        sel.length >= 2
          ? computeComparison({ text: essay.content, raters: sel, spansByRater, labelOrder })
          : null,
    }
  }, [selectedIds, allRaters, essay, spansByRater, labelOrder])

  function toggle(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  if (allRaters.length === 0) {
    return (
      <div className="empty" style={{ marginTop: 18 }}>
        <div className="big">👥</div>
        No one has annotated this essay yet.
      </div>
    )
  }

  // holistic-score readout over the selected raters
  const scoreVals = raters.map((r) => scoreByRater[r.id]).filter((s) => s != null)
  const scoreSpread = scoreVals.length >= 2 ? Math.max(...scoreVals) - Math.min(...scoreVals) : null

  return (
    <>
      {/* rater selector */}
      <div className="rater-select">
        <div className="rater-select-head">
          <span>Compare raters</span>
          <span className="rater-select-actions">
            <button className="link-btn" onClick={() => setSelectedIds(allRaters.map((r) => r.id))}>All</button>
            <button className="link-btn" onClick={() => setSelectedIds([])}>None</button>
          </span>
        </div>
        <div className="rater-chips">
          {allRaters.map((r) => {
            const on = selectedIds.includes(r.id)
            const sc = scoreByRater[r.id]
            return (
              <button
                key={r.id}
                className={`rater-toggle ${on ? 'on' : ''}`}
                style={{ '--c': r.color }}
                onClick={() => toggle(r.id)}
              >
                <span className="box">{on ? '✓' : ''}</span>
                <span className="dot" />
                {r.name}
                <span className="rater-meta">
                  {(spansByRater[r.id] || []).length} spans{sc != null ? ` · score ${sc}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {raters.length < 2 ? (
        <div className="empty" style={{ marginTop: 4 }}>
          Select at least two raters above to compare.
        </div>
      ) : (
        <>
          <div className="hl-row">
            <Metric label="Raters" value={raters.length} />
            <Metric label="Overall agreement" value={pct(comparison.overall)} hint="all tokens" />
            <Metric label="On labeled text" value={pct(comparison.overallLabeled)} hint="≥1 rater tagged" />
            <Metric label={comparison.kappaName || 'κ'} value={kap(comparison.kappa)} hint="chance-corrected" />
          </div>

          {/* holistic scores */}
          <div className="panel-card" style={{ marginBottom: 18 }}>
            <h3>Holistic scores (1–6)</h3>
            {scoreVals.length === 0 ? (
              <div className="cell-dim" style={{ fontSize: 13 }}>No scores submitted yet for the selected raters.</div>
            ) : (
              <div className="score-row">
                {raters.map((r) => (
                  <span key={r.id} className="score-pill" style={{ '--c': r.color }}>
                    <span className="dot" />
                    {r.name}: <b>{scoreByRater[r.id] ?? '—'}</b>
                  </span>
                ))}
                <span className={`chip ${scoreSpread === 0 ? 'green' : scoreSpread <= 1 ? 'amber' : 'red'}`} style={{ marginLeft: 6 }}>
                  {scoreSpread == null ? 'need 2 scores' : scoreSpread === 0 ? 'exact match' : `range ${scoreSpread}`}
                </span>
              </div>
            )}
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
                <OverlayParagraph key={i} para={p} text={essay.content} segments={comparison.segments} raters={raters} />
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
                      {scoreByRater[r.id] != null && <span className="cell-dim"> · score {scoreByRater[r.id]}</span>}
                    </div>
                    <div className="essay-text cmp-essay">
                      {paras.map((p, i) => (
                        <RaterParagraph key={i} para={p} text={essay.content} spans={spansByRater[r.id] || []} labelColor={labelColor} />
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
                {comparison.perLabel.length === 0 && (
                  <tr>
                    <td colSpan={raters.length + 2} className="cell-dim">No labels applied yet.</td>
                  </tr>
                )}
                {comparison.perLabel.map((row) => (
                  <tr key={row.label}>
                    <td>
                      <span className="legend-chip" style={{ '--c': labelColor[row.label] || '#888' }}>
                        <span className="dot" />
                        {row.label}
                      </span>
                    </td>
                    {raters.map((r) => (
                      <td key={r.id} className="cell-dim">{row.counts[r.id] || 0}</td>
                    ))}
                    <td><AgreeChip v={row.jaccard} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  {comparison.pairwise.map((p, i) => (
                    <tr key={i}>
                      <td>{raterName(raters, p.a)}</td>
                      <td>{raterName(raters, p.b)}</td>
                      <td><AgreeChip v={p.agreement} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel-card">
            <h3>Where they differ ({comparison.disagreements.length})</h3>
            {comparison.disagreements.length === 0 ? (
              <div className="cell-dim" style={{ fontSize: 13 }}>
                No disagreements — raters tagged the same text with the same labels. 🎯
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {comparison.disagreements.map((d, i) => (
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
      )}
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
