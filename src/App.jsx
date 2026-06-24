import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { onToast } from './lib/toast.js'
import AuthScreen from './components/AuthScreen.jsx'
import SetupScreen from './components/SetupScreen.jsx'
import Sidebar from './components/Sidebar.jsx'
import EssayList from './components/EssayList.jsx'
import Annotator from './components/Annotator.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import ExportPanel from './components/ExportPanel.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '')
  const [page, param] = h.split('/')
  return { page: page || 'essays', param: param || null }
}

function Toasts() {
  const [items, setItems] = useState([])
  useEffect(
    () =>
      onToast((t) => {
        setItems((cur) => [...cur, t])
        setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 3500)
      }),
    []
  )
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

const RUNNING_BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

/* Detect a freshly deployed build (version.json changes) and offer a one-click,
 * cache-busting reload — so code updates apply without a manual hard refresh. */
function UpdateBanner() {
  const [latest, setLatest] = useState(null)
  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const r = await fetch(new URL('version.json', document.baseURI).href + '?t=' + Date.now(), {
          cache: 'no-store',
        })
        if (!r.ok) return
        const { build } = await r.json()
        if (alive && build && build !== RUNNING_BUILD) setLatest(build)
      } catch {
        /* offline / version.json missing — ignore */
      }
    }
    check()
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    const id = setInterval(check, 120000)
    return () => {
      alive = false
      window.removeEventListener('focus', onFocus)
      clearInterval(id)
    }
  }, [])
  if (!latest) return null
  const reload = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('v', latest) // cache-bust index.html so the new code loads
    window.location.replace(url.toString())
  }
  return (
    <div className="update-banner">
      <span>A new version is available.</span>
      <button className="btn" style={{ height: 28, padding: '0 12px' }} onClick={reload}>
        Reload
      </button>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [profile, setProfile] = useState(null)
  // schemaState: 'checking' | 'missing' | 'ready'
  const [schemaState, setSchemaState] = useState('checking')
  const [route, setRoute] = useState(parseHash())

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const checkSchema = useCallback(async () => {
    setSchemaState('checking')
    const { error } = await supabase.from('labels').select('id').limit(1)
    if (!error) {
      setSchemaState('ready')
      return true
    }
    // 42P01 = relation missing; PGRST205 = table not in API schema cache
    if (error.code === '42P01' || error.code === 'PGRST205' || /not exist|schema cache/i.test(error.message)) {
      setSchemaState('missing')
    } else {
      setSchemaState('ready') // some other error; let pages surface it
    }
    return false
  }, [])

  const loadProfile = useCallback(async (user) => {
    let { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (!data) {
      // self-heal: account predates the signup trigger
      await supabase.from('profiles').insert({
        id: user.id,
        email: user.email,
        display_name: user.email?.split('@')[0],
      })
      const r = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      data = r.data
    }
    setProfile(data || null)
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    checkSchema().then((ok) => {
      if (ok) loadProfile(session.user)
    })
  }, [session, checkSchema, loadProfile])

  if (!authReady) return <div className="spinner" />
  if (!session) return (
    <>
      <UpdateBanner />
      <ThemeToggle />
      <AuthScreen />
      <Toasts />
    </>
  )
  if (schemaState === 'checking') return <div className="spinner" />
  if (schemaState === 'missing')
    return (
      <>
        <SetupScreen
          onRecheck={async () => {
            const ok = await checkSchema()
            if (ok) loadProfile(session.user)
            return ok
          }}
        />
        <Toasts />
      </>
    )

  const isAdmin = profile?.role === 'admin'

  let content
  if (route.page === 'annotate' && route.param) {
    content = <Annotator essayId={route.param} user={session.user} isAdmin={isAdmin} />
  } else if (route.page === 'export' && isAdmin) {
    content = <ExportPanel user={session.user} isAdmin={isAdmin} />
  } else if (route.page === 'admin' && isAdmin) {
    content = <AdminPanel user={session.user} />
  } else {
    content = <EssayList user={session.user} isAdmin={isAdmin} />
  }

  return (
    <div className="app">
      <UpdateBanner />
      <ThemeToggle />
      <Sidebar
        route={route}
        profile={profile}
        isAdmin={isAdmin}
        onLogout={async () => {
          // scope:'local' clears the browser session without a server round-trip,
          // so logout works even if the refresh token is invalid / offline.
          try {
            await supabase.auth.signOut({ scope: 'local' })
          } catch (e) {
            /* ignore — fall through to a hard local clear */
          }
          try {
            Object.keys(localStorage)
              .filter((k) => k.startsWith('sb-'))
              .forEach((k) => localStorage.removeItem(k))
          } catch (e) {
            /* ignore */
          }
          setProfile(null)
          setSession(null)
        }}
      />
      <main className="page">
        <div className="page-inner">{content}</div>
      </main>
      <Toasts />
    </div>
  )
}
