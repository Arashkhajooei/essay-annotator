import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { toast } from '../lib/toast.js'
import TxtUpload from './TxtUpload.jsx'

/* ---------- Labels tab ---------- */
function LabelRow({ label, onSaved }) {
  const [row, setRow] = useState(label)
  const dirty = JSON.stringify(row) !== JSON.stringify(label)

  async function save() {
    const { error } = await supabase
      .from('labels')
      .update({
        name: row.name.trim(),
        color: row.color,
        description: row.description,
        sort_order: row.sort_order,
        is_active: row.is_active,
      })
      .eq('id', label.id)
    if (error) return toast(error.message, 'error')
    toast('Label saved')
    onSaved()
  }

  async function remove() {
    if (!window.confirm(`Delete label “${label.name}”?`)) return
    const { error } = await supabase.from('labels').delete().eq('id', label.id)
    if (error) {
      // FK restrict: annotations exist with this label
      toast('Label is in use by annotations — deactivating it instead', 'error')
      await supabase.from('labels').update({ is_active: false }).eq('id', label.id)
    } else {
      toast('Label deleted')
    }
    onSaved()
  }

  return (
    <tr style={{ opacity: row.is_active ? 1 : 0.45 }}>
      <td>
        <input
          type="color"
          className="swatch-input"
          value={row.color}
          onChange={(e) => setRow({ ...row, color: e.target.value })}
        />
      </td>
      <td>
        <input
          className="input"
          value={row.name}
          onChange={(e) => setRow({ ...row, name: e.target.value })}
        />
      </td>
      <td>
        <input
          className="input"
          value={row.description || ''}
          placeholder="Description"
          onChange={(e) => setRow({ ...row, description: e.target.value })}
        />
      </td>
      <td style={{ width: 70 }}>
        <input
          className="input"
          type="number"
          value={row.sort_order}
          onChange={(e) => setRow({ ...row, sort_order: parseInt(e.target.value || '0', 10) })}
        />
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={row.is_active}
            onChange={(e) => setRow({ ...row, is_active: e.target.checked })}
          />
          active
        </label>
      </td>
      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
        {dirty && (
          <button className="btn" style={{ padding: '5px 12px', fontSize: 12 }} onClick={save}>
            Save
          </button>
        )}{' '}
        <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: 12 }} onClick={remove}>
          Delete
        </button>
      </td>
    </tr>
  )
}

function LabelsTab() {
  const [labels, setLabels] = useState(null)
  const [adding, setAdding] = useState({ name: '', color: '#0095f6', description: '' })

  async function load() {
    const { data, error } = await supabase.from('labels').select('*').order('sort_order').order('name')
    if (error) return toast(error.message, 'error')
    setLabels(data)
  }
  useEffect(() => {
    load()
  }, [])

  async function add(e) {
    e.preventDefault()
    const { error } = await supabase.from('labels').insert({
      name: adding.name.trim(),
      color: adding.color,
      description: adding.description.trim() || null,
      sort_order: (labels?.length || 0) + 1,
    })
    if (error) return toast(error.message, 'error')
    toast('Label added')
    setAdding({ name: '', color: '#0095f6', description: '' })
    load()
  }

  if (!labels) return <div className="spinner" />

  return (
    <>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <input
          type="color"
          className="swatch-input"
          value={adding.color}
          onChange={(e) => setAdding({ ...adding, color: e.target.value })}
        />
        <input
          className="input"
          style={{ maxWidth: 220 }}
          placeholder="New label name"
          required
          value={adding.name}
          onChange={(e) => setAdding({ ...adding, name: e.target.value })}
        />
        <input
          className="input"
          placeholder="Description (optional)"
          value={adding.description}
          onChange={(e) => setAdding({ ...adding, description: e.target.value })}
        />
        <button className="btn">Add label</button>
      </form>
      <table className="table">
        <thead>
          <tr>
            <th>Color</th>
            <th>Name</th>
            <th>Description</th>
            <th>Order</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {labels.map((l) => (
            <LabelRow key={l.id} label={l} onSaved={load} />
          ))}
        </tbody>
      </table>
    </>
  )
}

/* ---------- Essays tab ---------- */
function EssaysTab({ user }) {
  const [essays, setEssays] = useState(null)
  const [editing, setEditing] = useState(null) // essay object or 'new'
  const [form, setForm] = useState({ title: '', prompt: '', content: '' })

  async function load() {
    const { data, error } = await supabase
      .from('essays')
      .select('id, title, prompt, content, created_at')
      .order('created_at')
    if (error) return toast(error.message, 'error')
    setEssays(data)
  }
  useEffect(() => {
    load()
  }, [])

  function openEdit(essay) {
    setEditing(essay)
    setForm(
      essay === 'new'
        ? { title: '', prompt: '', content: '' }
        : { title: essay.title, prompt: essay.prompt || '', content: essay.content }
    )
  }

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
    setEditing(null)
    load()
  }

  async function save(e) {
    e.preventDefault()
    const payload = {
      title: form.title.trim(),
      prompt: form.prompt.trim() || null,
      content: form.content.replace(/\r\n/g, '\n').trim(),
    }
    let error
    if (editing === 'new') {
      ;({ error } = await supabase.from('essays').insert({ ...payload, created_by: user.id }))
    } else {
      ;({ error } = await supabase.from('essays').update(payload).eq('id', editing.id))
    }
    if (error) return toast(error.message, 'error')
    toast('Essay saved')
    setEditing(null)
    load()
  }

  async function remove(essay) {
    if (
      !window.confirm(
        `Delete “${essay.title}”? This also deletes ALL annotations on it, for every user.`
      )
    )
      return
    const { error } = await supabase.from('essays').delete().eq('id', essay.id)
    if (error) return toast(error.message, 'error')
    toast('Essay deleted')
    load()
  }

  if (!essays) return <div className="spinner" />

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <button className="btn" onClick={() => openEdit('new')}>
          + Add essay
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Words</th>
            <th>Added</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {essays.map((e) => (
            <tr key={e.id}>
              <td>
                <a href={`#/annotate/${e.id}`}>{e.title}</a>
              </td>
              <td>{e.content.split(/\s+/).length}</td>
              <td>{new Date(e.created_at).toLocaleDateString()}</td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                <button className="btn btn-dark" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => openEdit(e)}>
                  Edit
                </button>{' '}
                <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => remove(e)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing === 'new' ? 'Add essay' : 'Edit essay'}</h2>
            {editing === 'new' && (
              <TxtUpload
                onSingle={(f) =>
                  setForm((cur) => ({ ...cur, title: cur.title || f.title, content: f.text }))
                }
                onMany={bulkImport}
              />
            )}
            {editing !== 'new' && (
              <div className="auth-info" style={{ fontSize: 12 }}>
                Careful: changing the text shifts character offsets — existing annotations on this
                essay may no longer line up.
              </div>
            )}
            <form onSubmit={save}>
              <div className="field">
                <label>Title</label>
                <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="field">
                <label>Prompt</label>
                <textarea className="input" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
              </div>
              <div className="field">
                <label>Essay text — separate paragraphs with blank lines</label>
                <textarea className="input" required style={{ minHeight: 220 }} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-dark" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button className="btn">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

/* ---------- Users tab ---------- */
function UsersTab({ user }) {
  const [users, setUsers] = useState(null)

  async function load() {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at')
    if (error) return toast(error.message, 'error')
    setUsers(data)
  }
  useEffect(() => {
    load()
  }, [])

  async function setRole(p, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id)
    if (error) return toast(error.message, 'error')
    toast(`${p.email} is now ${role}`)
    load()
  }

  if (!users) return <div className="spinner" />

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Email</th>
          <th>Name</th>
          <th>Joined</th>
          <th>Role</th>
        </tr>
      </thead>
      <tbody>
        {users.map((p) => (
          <tr key={p.id}>
            <td>{p.email}</td>
            <td>{p.display_name}</td>
            <td>{new Date(p.created_at).toLocaleDateString()}</td>
            <td>
              <select
                className="input"
                style={{ width: 140 }}
                value={p.role}
                disabled={p.id === user.id}
                title={p.id === user.id ? "You can't change your own role" : ''}
                onChange={(e) => setRole(p, e.target.value)}
              >
                <option value="annotator">annotator</option>
                <option value="admin">admin</option>
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ---------- panel shell ---------- */
export default function AdminPanel({ user }) {
  const [tab, setTab] = useState('labels')
  return (
    <>
      <h1 className="hero-title">
        Admin <span className="hero-sub">— labels, essays & annotators</span>
      </h1>
      <p className="hero-desc">
        Define the label set (add custom moves, recolor, deactivate), manage the essay corpus, and
        control user roles.
      </p>
      <div className="tabs">
        {['labels', 'essays', 'users'].map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'labels' && <LabelsTab />}
      {tab === 'essays' && <EssaysTab user={user} />}
      {tab === 'users' && <UsersTab user={user} />}
    </>
  )
}
