import { useState, type FormEvent, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'

// Hand-built login form. Replaces @supabase/auth-ui-react, which is
// deprecated and crashes under React 19 (it left the page blank).

const C = {
  navy: '#0E1B2C',
  navyLight: '#162438',
  navyLighter: '#1E3050',
  navyBorder: '#243a55',
  gold: '#F4C20D',
  slate: '#94a3b8',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  marginTop: 6,
  background: C.navyLighter,
  border: `1px solid ${C.navyBorder}`,
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 14,
  outline: 'none',
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
    // On success, App's onAuthStateChange swaps to the Dashboard.
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: C.navy,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo & header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 16,
          }}>
            <div style={{
              width: 48, height: 48, backgroundColor: C.gold, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
            }}>
              ⚽
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>
                HonestStack
              </div>
              <div style={{ fontSize: 13, color: C.gold, fontWeight: 500, letterSpacing: '0.5px' }}>
                COCKPIT
              </div>
            </div>
          </div>
          <p style={{ color: C.slate, fontSize: 14 }}>World Cup 2026 Content Engine</p>
        </div>

        {/* Auth form */}
        <form onSubmit={handleSubmit} style={{
          backgroundColor: C.navyLight,
          borderRadius: 16,
          padding: 32,
          border: `1px solid ${C.navyBorder}`,
        }}>
          <label style={{ display: 'block', fontSize: 13, color: C.slate }}>
            Email
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com" style={inputStyle}
            />
          </label>
          <label style={{ display: 'block', fontSize: 13, color: C.slate, marginTop: 16 }}>
            Password
            <input
              type="password" required value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" style={inputStyle}
            />
          </label>

          {error && (
            <p style={{ color: '#f87171', fontSize: 13, marginTop: 14 }}>{error}</p>
          )}

          <button type="submit" disabled={busy} style={{
            width: '100%', marginTop: 22, padding: '12px 16px',
            background: C.gold, color: C.navy, border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}>
            {busy ? 'Signing in…' : 'Sign in to Cockpit'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#4a6080' }}>
          Private dashboard — authorized personnel only
        </p>
      </div>
    </div>
  )
}
