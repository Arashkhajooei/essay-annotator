import { useEffect, useMemo, useState } from 'react'
import { buildDocs, download, fetchExportData, FORMATS } from '../lib/exports.js'
import { toast } from '../lib/toast.js'

const annName = (a) => a.profiles?.display_name || a.profiles?.email || a.user_id.slice(0, 8)
const slug = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'annotator'

export default function ExportPanel({ user, isAdmin }) {
  const [data, setData] = useState(null)
  const [selAnn, setSelAnn] = useState(new Set())
  const [selEssay, setSelEssay] = useState(new Set())
  const [mode, setMode] = useState('combined') // 'combined' | 'separate'
  const [busyFmt, setBusyFmt] = useState(null)

  useEffect(() => {
    setData(null)
    fetchExportData(isAdmin ? 'all' : 'mine', user.id)
      .then((d) => {
        setData(d)
        setSelAnn(new Set(d.anns.map((a) => a.user_id)))
        setSelEssay(new Set(d.essays.map((e) => e.id)))
      })
      .catch((e) => toast(e.message, 'error'))
  }, [user.id, isAdmin])

  /* ---- derived: annotators with counts, essays with their annotators ---- */
  const annotators = useMemo(() => {
    if (!data) return []
    const m = new Map()
    for (const a of data.anns) {
      if (!m.has(a.user_id))
        m.set(a.user_id, { id: a.user_id, name: annName(a), count: 0, essays: new Set() })
      const x = m.get(a.user_id)
      x.count++
      x.essays.add(a.essay_id)
    }
    return [...m.values()].sort((x, y) => x.name.localeCompare(y.name))
  }, [data])

  const essayMeta = useMemo(() => {
    if (!data) return new Map()
    const m = new Map()
    for (const a of data.anns) {
      if (!m.has(a.essay_id)) m.set(a.essay_id, { names: new Set(), count: 0 })
      const x = m.get(a.essay_id)
      x.names.add(annName(a))
      x.count++
    }
    return m
  }, [data])

  const filteredAnns = useMemo(
    () => (data ? data.anns.filter((a) => selAnn.has(a.user_id) && selEssay.has(a.essay_id)) : []),
    [data, selAnn, selEssay]
  )

  const stats = useMemo(() => {
    const byLabel = {}
    for (const a of filteredAnns) {
      const name = a.labels?.name || '?'
      byLabel[name] = byLabel[name] || { count: 0, color: a.labels?.color || '#555' }
      byLabel[name].count++
    }
    return {
      annotations: filteredAnns.length,
      annotators: new Set(filteredAnns.map((a) => a.user_id)).size,
      essays: new Set(filteredAnns.map((a) => a.essay_id)).size,
      byLabel: Object.entries(byLabel).sort((a, b) => b[1].count - a[1].count),
    }
  }, [filteredAnns])

  function toggle(set, setter, id) {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  async function doExport(fmt) {
    if (!filteredAnns.length)
      return toast('Nothing selected to export — tick at least one annotator and essay', 'error')
    setBusyFmt(fmt.key)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      if (mode === 'separate' && isAdmin) {
        const ids = [...new Set(filteredAnns.map((a) => a.user_id))]
        for (const id of ids) {
          const subset = filteredAnns.filter((a) => a.user_id === id)
          const docs = buildDocs({ anns: subset, essays: data.essays })
          const who = slug(annName(subset[0]))
          download(`annotations-${who}-${stamp}-${fmt.key}${fmt.ext}`, fmt.build(docs), fmt.mime)
          // small gap so the browser doesn't swallow parallel downloads
          await new Promise((r) => setTimeout(r, 400))
        }
        toast(`Exported ${ids.length} file${ids.length === 1 ? '' : 's'} (one per annotator)`)
      } else {
        const docs = buildDocs({ anns: filteredAnns, essays: data.essays })
        download(`annotations-${stamp}-${fmt.key}${fmt.ext}`, fmt.build(docs), fmt.mime)
        toast(`Exported ${docs.length} document${docs.length === 1 ? '' : 's'} as ${fmt.name}`)
      }
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusyFmt(null)
    }
  }

  if (!data) return <div className="spinner" />

  const maxLabel = stats.byLabel[0]?.[1].count || 1

  return (
    <>
      <h1 className="hero-title">
        Export <span className="hero-sub">— training-ready datasets</span>
      </h1>
      <p className="hero-desc">
        {isAdmin
          ? 'Pick annotators and essays, then download datasets — combined or one file per annotator.'
          : 'Download your annotations as training-ready datasets.'}
      </p>

      {isAdmin && (
        <div className="panel-card" style={{ marginBottom: 24 }}>
          <h3>Export scope</h3>
          <div className="scope-grid">
            <div>
              <div className="scope-head">
                Annotators ({selAnn.size}/{annotators.length})
                <span className="scope-links">
                  <a href="#" onClick={(e) => { e.preventDefault(); setSelAnn(new Set(annotators.map((a) => a.id))) }}>all</a>
                  {' · '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setSelAnn(new Set()) }}>none</a>
                </span>
              </div>
              <div className="scope-list">
                {annotators.length === 0 && (
                  <div className="scope-empty">No annotations from anyone yet.</div>
                )}
                {annotators.map((a) => (
                  <label key={a.id} className="scope-item">
                    <input
                      type="checkbox"
                      checked={selAnn.has(a.id)}
                      onChange={() => toggle(selAnn, setSelAnn, a.id)}
                    />
                    <span className="scope-name">
                      {a.name}
                      {a.id === user.id && <em> (you)</em>}
                    </span>
                    <span className="scope-count">
                      {a.count} ann · {a.essays.size} essay{a.essays.size === 1 ? '' : 's'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="scope-head">
                Essays ({selEssay.size}/{data.essays.length})
                <span className="scope-links">
                  <a href="#" onClick={(e) => { e.preventDefault(); setSelEssay(new Set(data.essays.map((x) => x.id))) }}>all</a>
                  {' · '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setSelEssay(new Set()) }}>none</a>
                </span>
              </div>
              <div className="scope-list">
                {data.essays.map((e) => {
                  const meta = essayMeta.get(e.id)
                  return (
                    <label key={e.id} className="scope-item">
                      <input
                        type="checkbox"
                        checked={selEssay.has(e.id)}
                        onChange={() => toggle(selEssay, setSelEssay, e.id)}
                      />
                      <span className="scope-name" title={e.title}>{e.title}</span>
                      <span className="scope-count">
                        {meta
                          ? `${meta.count} ann — ${[...meta.names].join(', ')}`
                          : 'no annotations yet'}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="seg" style={{ margin: '16px 0 0' }}>
            <button className={mode === 'combined' ? 'active' : ''} onClick={() => setMode('combined')}>
              One combined file
            </button>
            <button className={mode === 'separate' ? 'active' : ''} onClick={() => setMode('separate')}>
              One file per annotator
            </button>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="num">{stats.essays}</div>
          <div className="lbl">Essays selected</div>
        </div>
        <div className="stat-card">
          <div className="num">{stats.annotations}</div>
          <div className="lbl">Annotations</div>
        </div>
        <div className="stat-card">
          <div className="num">{stats.annotators}</div>
          <div className="lbl">Annotator{stats.annotators === 1 ? '' : 's'}</div>
        </div>
        <div className="stat-card">
          <div className="num">{mode === 'separate' && isAdmin ? stats.annotators : 1}</div>
          <div className="lbl">File{(mode === 'separate' && isAdmin ? stats.annotators : 1) === 1 ? '' : 's'} per format</div>
        </div>
      </div>

      {stats.byLabel.length > 0 && (
        <div className="panel-card" style={{ marginBottom: 24 }}>
          <h3>Label distribution (selection)</h3>
          {stats.byLabel.map(([name, { count, color }]) => (
            <div className="bar-row" key={name}>
              <div className="bar-label">{name}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(count / maxLabel) * 100}%`, background: color }} />
              </div>
              <div className="bar-num">{count}</div>
            </div>
          ))}
        </div>
      )}

      <div className="export-grid">
        {FORMATS.map((f) => (
          <div className="export-card" key={f.key} onClick={() => doExport(f)}>
            <div className="fmt-tile" style={{ '--t': f.tint }}>{f.glyph}</div>
            <div className="fmt">{busyFmt === f.key ? 'Building…' : f.name}</div>
            <div className="desc">{f.desc}</div>
            <span className="ext">{f.ext}</span>
          </div>
        ))}
      </div>
    </>
  )
}
