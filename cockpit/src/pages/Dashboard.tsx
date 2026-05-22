import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Overview from './Overview'
import Sources from './Sources'
import Ideas from './Ideas'
import Videos from './Videos'
import Automations from './Automations'

const C = {
  navy: '#0E1B2C',
  navyLight: '#162438',
  navyLighter: '#1E3050',
  navyBorder: '#243a55',
  gold: '#F4C20D',
  slate: '#94a3b8',
}

type Tab = 'overview' | 'sources' | 'ideas' | 'videos' | 'automations'

const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '⚡' },
  { id: 'sources', label: 'Sources', icon: '📡' },
  { id: 'ideas', label: 'Ideas', icon: '💡' },
  { id: 'videos', label: 'Videos', icon: '🎬' },
  { id: 'automations', label: 'Automations', icon: '🤖' },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function Dashboard({ session }: { session: Record<string, any> }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const userEmail = session?.user?.email as string | undefined

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.navy, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <header style={{
        backgroundColor: C.navyLight,
        borderBottom: `1px solid ${C.navyBorder}`,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="mobile-menu-btn"
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              color: C.slate,
              cursor: 'pointer',
              padding: 4,
              fontSize: 20,
            }}
          >
            ☰
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36,
              backgroundColor: C.gold,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18
            }}>⚽</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>
                HonestStack
              </div>
              <div style={{ fontSize: 10, color: C.gold, fontWeight: 600, letterSpacing: '1px' }}>
                COCKPIT
              </div>
            </div>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="desktop-nav" style={{ display: 'flex', gap: 4 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: tab === item.id ? 600 : 400,
                backgroundColor: tab === item.id ? C.navyLighter : 'transparent',
                color: tab === item.id ? '#fff' : C.slate,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              {item.label}
              {tab === item.id && (
                <span style={{
                  width: 4, height: 4,
                  borderRadius: '50%',
                  backgroundColor: C.gold,
                  display: 'inline-block',
                }} />
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {userEmail && (
            <span className="user-email" style={{ fontSize: 12, color: C.slate }}>
              {userEmail}
            </span>
          )}
          <button
            onClick={handleSignOut}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: `1px solid ${C.navyBorder}`,
              backgroundColor: 'transparent',
              color: C.slate,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div style={{
          backgroundColor: C.navyLight,
          borderBottom: `1px solid ${C.navyBorder}`,
          padding: '8px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => { setTab(item.id); setMobileOpen(false) }}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: tab === item.id ? 600 : 400,
                backgroundColor: tab === item.id ? C.navyLighter : 'transparent',
                color: tab === item.id ? '#fff' : C.slate,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
          .user-email { display: none !important; }
        }
      `}</style>

      {/* Page content */}
      <main style={{ flex: 1, padding: '24px 20px', maxWidth: 1280, margin: '0 auto', width: '100%' }}>
        {tab === 'overview' && <Overview />}
        {tab === 'sources' && <Sources />}
        {tab === 'ideas' && <Ideas />}
        {tab === 'videos' && <Videos />}
        {tab === 'automations' && <Automations />}
      </main>
    </div>
  )
}
