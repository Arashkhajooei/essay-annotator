import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { toast } from '../lib/toast.js'
import TxtUpload from './TxtUpload.jsx'

export default function EssayList({ user, isAdmin }) {
  const [essays, setEssays] = useState(null)
  const [counts, setCounts] = useState({})
  const [submitted, setSubmitted] = useState(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', prompt: '', content: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    const [{ data: es, error }, { data: anns }, { data: subs }] = await Promise.all([
      supabase.from('essays').select('id, title, prompt, content, created_at').order('created_at'),
      supabase.from('annotations').select('id, essay_id').eq('user_id', user.id),
      supabase.from('essay_submissions').select('essay_id').eq('user_id', user.id),
    ])
    if (error) {
      toast(error.message, 'error')
      return
    }
    const c = {}
    for (const a of anns || []) c[a.essay_id] = (c[a.essay_id] || 0) + 1
    setCounts(c)
    setSubmitted(new Set((subs || []).map((s) => s.essay_id)))
    setEssays(es || [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  async function bulkImport(files) {
    const rows = files.map((f) => ({
      title: f.title,
      prompt: null,
      content: f.text,
      created_by: user.id,
    }))
    const { error } = await supabase.from('essays').insert(rows)
    if (error) return toast(error.message, 'error')
    toast(`Imported ${rows.length} essays from files`)
    setShowAdd(false)
    setForm({ title: '', prompt: '', content: '' })
    load()
  }

  async function addEssay(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('essays').insert({
      title: form.title.trim(),
      prompt: form.prompt.trim() || null,
      content: form.content.replace(/\r\n/g, '\n').trim(),
      created_by: user.id,
    })
    setSaving(false)
    if (error) return toast(error.message, 'error')
    toast('Essay added')
    setShowAdd(false)
    setForm({ title: '', prompt: '', content: '' })
    load()
  }

  if (!essays) return <div className="spinner" />

  const done = essays.filter((e) => submitted.has(e.id)).length
  const totalAnns = Object.values(counts).reduce((s, n) => s + n, 0)
  const wordsOf = (e) => e.content.split(/\s+/).filter(Boolean).length

  return (
    <>
      <h1 className="hero-title">
        Essay Corpus <span className="hero-sub">— tag rhetorical moves, essay by essay</span>
      </h1>
      <p className="hero-desc">
        Open an essay and mark its <b>Lead, Position, Claims, Counterclaims, Rebuttals, Evidence
        and Concluding Statement</b>. Your annotations are private to your account; submit each
        essay when you&apos;re done.
      </p>

      <div className="hl-row">
        <div className="hl-item">
          <div className="hl-label"><span className="dot" style={{ background: '#7da6f2' }} />essays in corpus</div>
          <div className="hl-value">{essays.length}</div>
        </div>
        <div className="hl-item">
          <div className="hl-label"><span className="dot" style={{ background: '#fcd34d' }} />your annotations</div>
          <div className="hl-value">{totalAnns}</div>
        </div>
        <div className="hl-item">
          <div className="hl-label"><span className="dot" style={{ background: '#4ade80' }} />submitted by you</div>
          <div className="hl-value">
            {done}<span className="hl-unit">/ {essays.length}</span>
          </div>
        </div>
        <div className="hl-item">
          <div className="hl-label"><span className="dot" style={{ background: '#f472b6' }} />remaining</div>
          <div className="hl-value">{essays.length - done}</div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-toolbar">
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
            {essays.length} essay{essays.length === 1 ? '' : 's'} · click a row to annotate
          </span>
          {isAdmin && (
            <button className="btn" onClick={() => setShowAdd(true)}>
              + New essay
            </button>
          )}
        </div>
        {essays.length === 0 ? (
          <div className="empty" style={{ border: 'none' }}>
            <div className="big">📝</div>
            No essays yet. {isAdmin ? 'Add the first one with “New essay”.' : 'Add one or ask an admin.'}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Essay</th>
                <th>Words</th>
                <th>Your annotations</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {essays.map((e, i) => {
                const n = counts[e.id] || 0
                const isDone = submitted.has(e.id)
                return (
                  <tr key={e.id} className="rowlink" onClick={() => (window.location.hash = `#/annotate/${e.id}`)}>
                    <td className={`rank ${i === 0 ? 'top' : ''}`}>{i + 1}</td>
                    <td>
                      <div className="cell-title">{e.title}</div>
                      <div className="cell-sub">
                        added {new Date(e.created_at).toLocaleDateString()}
                        {e.prompt ? ` · ${e.prompt.slice(0, 70)}${e.prompt.length > 70 ? '…' : ''}` : ''}
                      </div>
                    </td>
                    <td className="cell-dim">{wordsOf(e)}</td>
                    <td>
                      <span className={`chip ${n > 0 ? 'amber' : 'dim'}`}>{n}</span>
                    </td>
                    <td>
                      {isDone ? (
                        <span className="chip green">✓ Submitted</span>
                      ) : n > 0 ? (
                        <span className="chip blue">In progress</span>
                      ) : (
                        <span className="chip dim">Not started</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New essay</h2>
            <TxtUpload
              onSingle={(f) =>
                setForm((cur) => ({ ...cur, title: cur.title || f.title, content: f.text }))
              }
              onMany={bulkImport}
            />
            <form onSubmit={addEssay}>
              <div className="field">
                <label>Title</label>
                <input
                  className="input"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Should University Education Be Free?"
                />
              </div>
              <div className="field">
                <label>Prompt (optional)</label>
                <textarea
                  className="input"
                  value={form.prompt}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                  placeholder="The TOEFL-style question the essay answers"
                />
              </div>
              <div className="field">
                <label>Essay text — separate paragraphs with blank lines</label>
                <textarea
                  className="input"
                  required
                  style={{ minHeight: 200 }}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Paste the full essay here…"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-dark" onClick={() => setShowAdd(false)}>
                  Cancel
                </button>
                <button className="btn" disabled={saving}>
                  {saving ? 'Saving…' : 'Add essay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
