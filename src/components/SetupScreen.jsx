import { useState } from 'react'
import schemaSql from '../../supabase/schema.sql?raw'
import { SQL_EDITOR_URL, supabase } from '../lib/supabase.js'
import { toast } from '../lib/toast.js'

export default function SetupScreen({ onRecheck }) {
  const [copied, setCopied] = useState(false)
  const [checking, setChecking] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(schemaSql)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="setup-card">
      <h1 className="wordmark" style={{ fontSize: 30 }}>
        Annotator
      </h1>
      <h2 style={{ margin: '8px 0 4px' }}>One step left: install the database</h2>
      <p style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>
        The app is connected to your Supabase project, but the tables don&apos;t exist yet. This
        takes about 30 seconds:
      </p>
      <ol className="setup-steps">
        <li>
          <button className="btn" onClick={copy} style={{ marginRight: 10 }}>
            {copied ? '✓ Copied' : 'Copy the setup SQL'}
          </button>
          (everything in the box below)
        </li>
        <li>
          Open the{' '}
          <a href={SQL_EDITOR_URL} target="_blank" rel="noreferrer">
            Supabase SQL Editor
          </a>{' '}
          and paste it
        </li>
        <li>
          Click <b>Run</b>, then come back here and{' '}
          <button
            className="btn btn-dark"
            disabled={checking}
            onClick={async () => {
              setChecking(true)
              const ok = await onRecheck()
              setChecking(false)
              if (!ok) toast('Still not finding the tables — did the SQL run without errors?', 'error')
            }}
          >
            {checking ? 'Checking…' : 'Re-check'}
          </button>
        </li>
      </ol>
      <div className="sql-box">{schemaSql}</div>
      <p style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 16 }}>
        The script is idempotent — running it twice is harmless. Logged in as the wrong account?{' '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            supabase.auth.signOut()
          }}
        >
          Log out
        </a>
      </p>
    </div>
  )
}
