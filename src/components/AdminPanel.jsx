import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { toast } from '../lib/toast.js'
import { parseCSVObjects } from '../lib/csv.js'
import TxtUpload from './TxtUpload.jsx'
import ComparisonTab from './ComparisonTab.jsx'

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

/* per-essay multi-rater assignment dropdown */
const EMPTY_SET = new Set()
function RaterAssign({ essayId, raters, assigned, adminId, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (ev) => {
      if (ref.current && !ref.current.contains(ev.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function toggle(rid) {
    if (assigned.has(rid)) {
      const { error } = await supabase
        .from('essay_assignments')
        .delete()
        .eq('essay_id', essayId)
        .eq('user_id', rid)
      if (error) return toast(error.message, 'error')
      onChange(essayId, rid, false)
    } else {
      const { error } = await supabase
        .from('essay_assignments')
        .insert({ essay_id: essayId, user_id: rid, assigned_by: adminId })
      if (error) return toast(error.message, 'error')
      onChange(essayId, rid, true)
    }
  }

  const count = assigned.size
  return (
    <div className="rater-dd" ref={ref}>
      <button
        className="btn btn-dark"
        style={{ padding: '5px 10px', fontSize: 12, minWidth: 112 }}
        onClick={() => setOpen((o) => !o)}
      >
        {count === 0 ? 'Assign raters' : `${count} rater${count === 1 ? '' : 's'}`} ▾
      </button>
      {open && (
        <div className="rater-dd-menu">
          {raters.length === 0 && <div className="rater-dd-empty">No users yet</div>}
          {raters.map((r) => (
            <label key={r.id} className="rater-dd-item">
              <input type="checkbox" checked={assigned.has(r.id)} onChange={() => toggle(r.id)} />
              <span>
                {r.name}
                {r.role === 'admin' ? ' (admin)' : ''}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Essays tab ---------- */
function EssaysTab({ user }) {
  const [essays, setEssays] = useState(null)
  const [editing, setEditing] = useState(null) // essay object or 'new'
  const [form, setForm] = useState({ title: '', prompt: '', content: '' })
  const [raters, setRaters] = useState([])
  const [assignMap, setAssignMap] = useState({}) // essayId -> Set(userId)
  const csvRef = useRef(null)

  async function load() {
    const [{ data, error }, { data: profs }, { data: asg }] = await Promise.all([
      supabase
        .from('essays')
        .select('id, title, prompt, content, created_at, native_language')
        .order('created_at'),
      supabase.from('profiles').select('id, display_name, email, role').order('created_at'),
      supabase.from('essay_assignments').select('essay_id, user_id'),
    ])
    if (error) return toast(error.message, 'error')
    const map = {}
    for (const a of asg || []) (map[a.essay_id] = map[a.essay_id] || new Set()).add(a.user_id)
    setRaters((profs || []).map((p) => ({ id: p.id, name: p.display_name || p.email, role: p.role })))
    setAssignMap(map)
    setEssays(data)
  }
  useEffect(() => {
    load()
  }, [])

  function onAssignChange(essayId, rid, added) {
    setAssignMap((prev) => {
      const next = { ...prev }
      const s = new Set(next[essayId] || [])
      if (added) s.add(rid)
      else s.delete(rid)
      next[essayId] = s
      return next
    })
  }

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

  async function importCsv(file) {
    let objs
    try {
      objs = parseCSVObjects(await file.text())
    } catch (err) {
      return toast('CSV parse failed: ' + err.message, 'error')
    }
    const pick = (o, ...names) => {
      for (const n of names) {
        const k = Object.keys(o).find((kk) => kk.toLowerCase().trim() === n.toLowerCase())
        if (k && o[k] != null && String(o[k]).trim() !== '') return String(o[k]).trim()
      }
      return null
    }
    const rows = []
    for (const o of objs) {
      const content = (pick(o, 'full_text', 'content', 'essay', 'text') || '').replace(/\r\n/g, '\n').trim()
      if (!content) continue
      const sid = pick(o, 'essay_id', 'id')
      const pname = pick(o, 'prompt_name')
      const wc = pick(o, 'essay_word_count', 'word_count')
      const promptText = pick(o, 'assignment', 'prompt')
      const cleanId = (sid || String(rows.length + 1)).replace(/\.txt$/i, '')
      rows.push({
        title: ((pname ? pname + ' · ' : '') + '#' + cleanId).slice(0, 200),
        prompt: promptText,
        content,
        source_essay_id: sid,
        ordinal_score: pick(o, 'ordinal_score'),
        holistic_essay_score: pick(o, 'holistic_essay_score'),
        task: pick(o, 'task'),
        prompt_name: pname,
        essay_word_count: wc ? parseInt(wc.replace(/[^0-9]/g, ''), 10) || null : null,
        native_language: pick(o, 'native language', 'native_language'),
        created_by: user.id,
      })
    }
    if (!rows.length) return toast('No rows with essay text found in CSV', 'error')
    if (!window.confirm(`Import ${rows.length} essays from this CSV?`)) return
    let ok = 0
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from('essays').insert(rows.slice(i, i + 100))
      if (error) {
        toast(`Stopped after ${ok}: ${error.message}`, 'error')
        break
      }
      ok += Math.min(100, rows.length - i)
    }
    toast(`✓ Imported ${ok} of ${rows.length} essays`)
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
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <button className="btn" onClick={() => openEdit('new')}>
          + Add essay
        </button>
        <button className="btn btn-dark" onClick={() => csvRef.current?.click()}>
          Import CSV (bulk)
        </button>
        <input
          ref={csvRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importCsv(f)
            e.target.value = ''
          }}
        />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Words</th>
            <th>Lang</th>
            <th>Raters</th>
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
              <td className="cell-dim">{e.native_language || '—'}</td>
              <td>
                <RaterAssign
                  essayId={e.id}
                  raters={raters}
                  assigned={assignMap[e.id] || EMPTY_SET}
                  adminId={user.id}
                  onChange={onAssignChange}
                />
              </td>
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

/* ---------- Assignments tab ---------- */
function AssignmentsTab({ user }) {
  const [raters, setRaters] = useState(null)
  const [essays, setEssays] = useState([])
  const [raterId, setRaterId] = useState('')
  const [assigned, setAssigned] = useState(new Set())
  const [orig, setOrig] = useState(new Set())
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('id, display_name, email, role').order('created_at'),
      supabase.from('essays').select('id, title, native_language').order('created_at'),
    ]).then(([{ data: p, error: e1 }, { data: es, error: e2 }]) => {
      if (e1 || e2) return toast((e1 || e2).message, 'error')
      setRaters(p || [])
      setEssays(es || [])
    })
  }, [])

  async function selectRater(id) {
    setRaterId(id)
    setQ('')
    if (!id) {
      setAssigned(new Set())
      setOrig(new Set())
      return
    }
    const { data, error } = await supabase.from('essay_assignments').select('essay_id').eq('user_id', id)
    if (error) return toast(error.message, 'error')
    const s = new Set((data || []).map((r) => r.essay_id))
    setAssigned(new Set(s))
    setOrig(s)
  }

  const filtered = essays.filter((e) => {
    if (!q) return true
    const s = q.toLowerCase()
    return (e.title || '').toLowerCase().includes(s) || (e.native_language || '').toLowerCase().includes(s)
  })

  function toggle(id) {
    setAssigned((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function addFiltered() {
    setAssigned((prev) => { const n = new Set(prev); filtered.forEach((e) => n.add(e.id)); return n })
  }
  function removeFiltered() {
    setAssigned((prev) => { const n = new Set(prev); filtered.forEach((e) => n.delete(e.id)); return n })
  }

  const toAdd = [...assigned].filter((id) => !orig.has(id))
  const toRemove = [...orig].filter((id) => !assigned.has(id))
  const dirty = toAdd.length > 0 || toRemove.length > 0

  async function save() {
    if (!raterId) return
    setSaving(true)
    try {
      for (let i = 0; i < toAdd.length; i += 100) {
        const chunk = toAdd.slice(i, i + 100).map((eid) => ({ essay_id: eid, user_id: raterId, assigned_by: user.id }))
        const { error } = await supabase.from('essay_assignments').insert(chunk)
        if (error) throw error
      }
      for (let i = 0; i < toRemove.length; i += 100) {
        const chunk = toRemove.slice(i, i + 100)
        const { error } = await supabase.from('essay_assignments').delete().eq('user_id', raterId).in('essay_id', chunk)
        if (error) throw error
      }
      setOrig(new Set(assigned))
      toast(`Saved — ${assigned.size} essay(s) assigned`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!raters) return <div className="spinner" />

  return (
    <>
      <p className="hero-desc" style={{ marginTop: -8 }}>
        Pick a rater, then choose which essays they can see. Raters only see essays assigned to them.
      </p>
      <div className="field" style={{ maxWidth: 360 }}>
        <label>Rater</label>
        <select className="input" value={raterId} onChange={(e) => selectRater(e.target.value)}>
          <option value="">Select a rater to assign essays…</option>
          {raters.map((r) => (
            <option key={r.id} value={r.id}>
              {r.display_name || r.email}
              {r.role === 'admin' ? ' (admin)' : ''}
            </option>
          ))}
        </select>
      </div>

      {raterId && (
        <div className="panel-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ maxWidth: 260 }}
              placeholder="Search essays…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn btn-dark" style={{ padding: '6px 12px', fontSize: 12 }} onClick={addFiltered}>
              Select all{q ? ' (filtered)' : ''}
            </button>
            <button className="btn btn-dark" style={{ padding: '6px 12px', fontSize: 12 }} onClick={removeFiltered}>
              Clear{q ? ' (filtered)' : ''}
            </button>
            <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 12 }}>
              {assigned.size} assigned · {filtered.length} shown
            </span>
          </div>
          <div className="scope-list" style={{ maxHeight: '52vh' }}>
            {filtered.map((e) => (
              <label key={e.id} className="scope-item">
                <input type="checkbox" checked={assigned.has(e.id)} onChange={() => toggle(e.id)} />
                <span className="scope-name">
                  {e.title}
                  {e.native_language ? <em> · {e.native_language}</em> : null}
                </span>
              </label>
            ))}
            {filtered.length === 0 && <div className="scope-empty">No essays match.</div>}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save assignments'}
            </button>
            {dirty && (
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                +{toAdd.length} / −{toRemove.length} pending
              </span>
            )}
          </div>
        </div>
      )}
    </>
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
        Define the label set, manage the essay corpus (incl. bulk CSV import), assign essays to
        raters, control user roles, and compare how annotators agree on each essay.
      </p>
      <div className="tabs">
        {['labels', 'essays', 'assign', 'users', 'compare'].map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'labels' && <LabelsTab />}
      {tab === 'essays' && <EssaysTab user={user} />}
      {tab === 'assign' && <AssignmentsTab user={user} />}
      {tab === 'users' && <UsersTab user={user} />}
      {tab === 'compare' && <ComparisonTab />}
    </>
  )
}
