import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'

export type NavItem = { to: string; label: string }

/** Shared shell for every role's area: brand, role nav, account menu. */
export function PortalLayout({ title, nav }: { title: string; nav: NavItem[] }) {
  const { user, signOut } = useAuth()

  return (
    <div className="portal">
      <header className="portal-header">
        <span className="brand">{title}</span>
        <nav className="portal-nav">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={false}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="account">
          <span className="account-email">{user?.email}</span>
          <button type="button" className="button-link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="portal-main">
        <Outlet />
      </main>
    </div>
  )
}

export function ComingSoon({ area }: { area: string }) {
  return (
    <section className="card">
      <h1>{area}</h1>
      <p className="muted">
        This area is being ported from the Next.js portal. Sign-in and role routing already work.
      </p>
    </section>
  )
}
