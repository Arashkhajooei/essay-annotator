export default function TopNav({ route, profile, isAdmin, onLogout }) {
  const nav = [
    { key: 'essays', label: 'Essays', hash: '#/essays' },
    { key: 'export', label: 'Export', hash: '#/export' },
  ]
  if (isAdmin) nav.push({ key: 'admin', label: 'Admin', hash: '#/admin' })

  const active = route.page === 'annotate' ? 'essays' : route.page

  return (
    <header className="topnav">
      <a href="#/essays" className="logo-badge">
        Annotator
      </a>
      <nav className="nav-links">
        {nav.map((n) => (
          <a key={n.key} href={n.hash} className={`nav-link ${active === n.key ? 'active' : ''}`}>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="nav-right">
        <span className="nav-user" title={profile?.email || ''}>
          <b>{profile?.display_name || profile?.email || 'me'}</b>
          {isAdmin ? ' · admin' : ''}
        </span>
        <button className="btn" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  )
}
