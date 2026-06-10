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
      supabase.from('essays').select('id, title, prompt, created_at').order('created_at'),
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

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Essays</h1>
          <p className="page-sub">
            {essays.length} essay{essays.length === 1 ? '' : 's'} · {done} submitted by you
          </p>
        </div>
        <button className="btn" onClick={() => setShowAdd(true)}>
          + New essay
        </button>
      </div>

      {essays.length === 0 ? (
        <div className="empty">
          <div className="big">📝</div>
          No essays yet. {isAdmin ? 'Add the first one with “New essay”.' : 'Ask an admin to add some, or add your own.'}
        </div>
      ) : (
        <div className="cards">
          {essays.map((e, i) => {
            const n = counts[e.id] || 0
            const isDone = submitted.has(e.id)
            return (
              <div
                key={e.id}
                className="essay-card"
                onClick={() => (window.location.hash = `#/annotate/${e.id}`)}
              >
                <div className="essay-card-head">
                  <div className={`story-ring ${isDone ? 'done' : ''}`}>
                    <div className="story-ring-inner">{i + 1}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="essay-card-title">{e.title}</div>
                    <div className="essay-card-meta">
                      {new Date(e.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {e.prompt && <div className="essay-card-prompt">{e.prompt}</div>}
                <div className="essay-card-foot">
                  <span className="pill">
                    {n} annotation{n === 1 ? '' : 's'}
                  </span>
                  {isDone && <span className="pill submitted">✓ Submitted</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
