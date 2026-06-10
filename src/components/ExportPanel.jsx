import { useEffect, useMemo, useState } from 'react'
import { buildDocs, download, fetchExportData, FORMATS } from '../lib/exports.js'
import { toast } from '../lib/toast.js'

export default function ExportPanel({ user, isAdmin }) {
  const [scope, setScope] = useState('mine') // 'mine' | 'all'
  const [data, setData] = useState(null)
  const [busyFmt, setBusyFmt] = useState(null)

  useEffect(() => {
    setData(null)
    fetchExportData(scope, user.id)
      .then(setData)
      .catch((e) => toast(e.message, 'error'))
  }, [scope, user.id])

  const docs = useMemo(() => (data ? buildDocs(data) : []), [data])

  const stats = useMemo(() => {
    if (!data) return null
    const annotators = new Set(data.anns.map((a) => a.user_id))
    const byLabel = {}
    for (const a of data.anns) {
      const name = a.labels?.name || '?'
      byLabel[name] = byLabel[name] || { count: 0, color: a.labels?.color || '#555' }
      byLabel[name].count++
    }
    return {
      essays: data.essays.length,
      annotations: data.anns.length,
      annotators: annotators.size,
      byLabel: Object.entries(byLabel).sort((a, b) => b[1].count - a[1].count),
    }
  }, [data])

  function doExport(fmt) {
    if (!docs.length) return toast('Nothing to export yet — annotate something first', 'error')
    setBusyFmt(fmt.key)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      download(`annotations-${scope}-${stamp}-${fmt.key}${fmt.ext}`, fmt.build(docs), fmt.mime)
      toast(`Exported ${docs.length} document${docs.length === 1 ? '' : 's'} as ${fmt.name}`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusyFmt(null)
    }
  }

  const maxLabel = stats?.byLabel[0]?.[1].count || 1

  return (
    <>
      <h1 className="page-title">Export</h1>
      <p className="page-sub">Download the annotations as training-ready datasets.</p>

      {isAdmin && (
        <div className="seg">
          <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>
            My annotations
          </button>
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
            All annotators
          </button>
        </div>
      )}

      {!data ? (
        <div className="spinner" />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="num">{stats.essays}</div>
              <div className="lbl">Essays</div>
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
              <div className="num">{docs.length}</div>
              <div className="lbl">Export documents</div>
            </div>
          </div>

          {stats.byLabel.length > 0 && (
            <div className="panel-card" style={{ marginBottom: 24 }}>
              <h3>Label distribution</h3>
              {stats.byLabel.map(([name, { count, color }]) => (
                <div className="bar-row" key={name}>
                  <div className="bar-label">{name}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(count / maxLabel) * 100}%`, background: color }}
                    />
                  </div>
                  <div className="bar-num">{count}</div>
                </div>
              ))}
            </div>
          )}

          <div className="export-grid">
            {FORMATS.map((f) => (
              <div className="export-card" key={f.key} onClick={() => doExport(f)}>
                <div className="fmt">{busyFmt === f.key ? 'Building…' : f.name}</div>
                <div className="desc">{f.desc}</div>
                <span className="ext">{f.ext}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
