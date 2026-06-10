import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function AuthScreen() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email.split('@')[0] },
            emailRedirectTo: window.location.origin + window.location.pathname,
          },
        })
        if (error) throw error
        if (data.session) {
          // auto-confirm is on — logged in immediately
        } else {
          setInfo(
            'Account created. Check your email for a confirmation link, then come back and log in.'
          )
          setMode('login')
        }
      }
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <span className="logo-badge">Annotator</span>
        <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <p className="auth-sub">
          Tag the rhetorical moves of TOEFL-style essays — Lead, Position, Claim, Evidence and
          more.
        </p>
        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-info">{info}</div>}
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <input
              className="input"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
          <input
            className="input"
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>
      </div>
      <div className="auth-alt">
        {mode === 'login' ? (
          <>
            Don&apos;t have an account?{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setMode('signup')
                setError(null)
              }}
            >
              Sign up
            </a>
          </>
        ) : (
          <>
            Have an account?{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                setMode('login')
                setError(null)
              }}
            >
              Log in
            </a>
          </>
        )}
      </div>
      <div className="auth-foot">Essay rhetorical-move annotation · powered by Supabase</div>
    </div>
  )
}
