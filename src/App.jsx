import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase.js'
import { onToast } from './lib/toast.js'
import AuthScreen from './components/AuthScreen.jsx'
import SetupScreen from './components/SetupScreen.jsx'
import TopNav from './components/TopNav.jsx'
import EssayList from './components/EssayList.jsx'
import Annotator from './components/Annotator.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import ExportPanel from './components/ExportPanel.jsx'

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
    content = <Annotator essayId={route.param} user={session.user} />
  } else if (route.page === 'export') {
    content = <ExportPanel user={session.user} isAdmin={isAdmin} />
  } else if (route.page === 'admin' && isAdmin) {
    content = <AdminPanel user={session.user} />
  } else {
    content = <EssayList user={session.user} isAdmin={isAdmin} />
  }

  return (
    <>
      <TopNav
        route={route}
        profile={profile}
        isAdmin={isAdmin}
        onLogout={() => supabase.auth.signOut()}
      />
      <main className="page">
        <div className="page-inner">{content}</div>
      </main>
      <Toasts />
    </>
  )
}
