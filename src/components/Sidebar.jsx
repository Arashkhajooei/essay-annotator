import { useState } from 'react'

const icons = {
  essays: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M9 7h7M9 11h7" />
    </svg>
  ),
  export: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9.5 12l2 2 3.5-4" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </svg>
  ),
}

export default function Sidebar({ route, profile, isAdmin, onLogout }) {
  const nav = [{ key: 'essays', label: 'Essays', hash: '#/essays' }]
  if (isAdmin) nav.push({ key: 'export', label: 'Export', hash: '#/export' })
  if (isAdmin) nav.push({ key: 'admin', label: 'Admin', hash: '#/admin' })

  const active = route.page === 'annotate' ? 'essays' : route.page

  const [theme, setTheme] = useState(
    () => (typeof document !== 'undefined' && document.documentElement.dataset.theme) || 'dark'
  )
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('rita-theme', next)
    } catch (e) {
      /* ignore */
    }
    setTheme(next)
  }

  return (
    <nav className="sidebar">
      <a href="#/essays" className="logo-badge">
        Rita Annotator
      </a>
      {nav.map((n) => (
        <a key={n.key} href={n.hash} className={`nav-item ${active === n.key ? 'active' : ''}`}>
          {icons[n.key]}
          <span>{n.label}</span>
        </a>
      ))}
      <div className="sidebar-footer">
        <div className="nav-item" style={{ cursor: 'default' }} title={profile?.email || ''}>
          {icons.user}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile?.display_name || profile?.email || 'me'}
            {isAdmin && (
              <span style={{ color: 'var(--text-3)', fontSize: 11, display: 'block' }}>admin</span>
            )}
          </span>
        </div>
        <button className="nav-item" onClick={toggleTheme} title="Toggle light / dark mode">
          {theme === 'dark' ? icons.sun : icons.moon}
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <button className="nav-item" onClick={onLogout}>
          {icons.logout}
          <span>Log out</span>
        </button>
      </div>
    </nav>
  )
}
