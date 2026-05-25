import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'

const C = {
  gold: '#F4C20D',
  navyBorder: '#243a55',
  navyLight: '#162438',
  navyLighter: '#1E3050',
  slate: '#94a3b8',
  red: '#f87171',
  green: '#10b981',
  blue: '#60a5fa',
  amber: '#f59e0b',
  redBg: 'rgba(239,68,68,0.12)',
  greenBg: 'rgba(16,185,129,0.12)',
}

type TikTokAccount = {
  open_id: string
  display_name: string | null
  avatar_url: string | null
  scope: string | null
  created_at: string
  updated_at: string
}

export default function Connections() {
  const [tiktok, setTiktok] = useState<TikTokAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  // Handle the TikTok OAuth callback redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tt = params.get('tiktok')
    if (tt === 'connected') {
      const name = params.get('display_name') ?? ''
      setSuccess(`TikTok connected${name ? ` as ${name}` : ''}`)
      // Clean the URL so a refresh doesn't show the toast again.
      window.history.replaceState({}, '', window.location.pathname)
    } else if (tt === 'error') {
      const reason = params.get('reason') ?? 'unknown error'
      setError(`TikTok connect failed: ${reason}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [])

  async function fetchAccounts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('social_accounts')
      .select('open_id, display_name, avatar_url, scope, created_at, updated_at')
      .eq('platform', 'tiktok')
      .maybeSingle()
    if (error && error.code !== 'PGRST116') {
      setError(`Couldn't load TikTok status: ${error.message}`)
    } else {
      setTiktok((data as TikTokAccount | null) ?? null)
    }
    setLoading(false)
  }

  async function connectTikTok() {
    setConnecting(true)
    setError(null)
    setSuccess(null)
    const { data, error } = await supabase.functions.invoke('tiktok-connect-init', {
      body: {},
    })
    if (error) {
      setError(`Connect init failed: ${error.message}`)
      setConnecting(false)
      return
    }
    const url = (data as { auth_url?: string })?.auth_url
    if (!url) {
      setError('No auth URL returned')
      setConnecting(false)
      return
    }
    // Hand off to TikTok. The callback will redirect back here with
    // ?tiktok=connected (or ?tiktok=error&reason=...).
    window.location.href = url
  }

  async function disconnectTikTok() {
    if (!confirm('Disconnect TikTok? You will need to re-authorize to publish.')) return
    setDisconnecting(true)
    setError(null)
    setSuccess(null)
    const { error } = await supabase
      .from('social_accounts')
      .delete()
      .eq('platform', 'tiktok')
    setDisconnecting(false)
    if (error) {
      setError(`Disconnect failed: ${error.message}`)
    } else {
      setTiktok(null)
      setSuccess('TikTok disconnected')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 4 }}>
          Connections
        </h1>
        <p style={{ fontSize: 14, color: C.slate }}>
          Link your social accounts so HonestStack can publish rendered videos directly.
        </p>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          backgroundColor: C.redBg, color: C.red, fontSize: 13,
          border: `1px solid ${C.red}40`,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          backgroundColor: C.greenBg, color: C.green, fontSize: 13, fontWeight: 600,
          border: `1px solid ${C.green}40`,
        }}>
          ✓ {success}
        </div>
      )}

      {/* ── YouTube ─────────────────────────────────────────────── */}
      <Card style={{ padding: '16px 20px', borderLeft: `3px solid ${C.green}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            backgroundColor: '#FF0000', color: '#fff', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            flexShrink: 0,
          }}>YT</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, color: '#fff', fontWeight: 600, marginBottom: 2 }}>
              YouTube
            </div>
            <div style={{ fontSize: 12, color: C.green }}>
              ✓ Connected — publishing as the HonestStack channel
            </div>
          </div>
          <div style={{
            fontSize: 11, color: C.slate, padding: '4px 10px',
            border: `1px solid ${C.navyBorder}`, borderRadius: 6,
          }}>
            via stored refresh_token
          </div>
        </div>
      </Card>

      {/* ── TikTok ──────────────────────────────────────────────── */}
      <Card style={{
        padding: '16px 20px',
        borderLeft: `3px solid ${tiktok ? C.green : C.amber}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {tiktok?.avatar_url ? (
            <img
              src={tiktok.avatar_url}
              alt="TikTok avatar"
              style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              backgroundColor: '#000', color: '#fff', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              flexShrink: 0,
            }}>TT</div>
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, color: '#fff', fontWeight: 600, marginBottom: 2 }}>
              TikTok
            </div>
            {loading ? (
              <div style={{ fontSize: 12, color: C.slate }}>Loading…</div>
            ) : tiktok ? (
              <div style={{ fontSize: 12, color: C.green }}>
                ✓ Connected{tiktok.display_name ? ` as ${tiktok.display_name}` : ''}
                {tiktok.scope && (
                  <span style={{ color: C.slate, marginLeft: 8 }}>
                    · scopes: {tiktok.scope}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.amber }}>
                Not connected — connect to publish videos to TikTok
              </div>
            )}
          </div>
          {tiktok ? (
            <button
              onClick={disconnectTikTok}
              disabled={disconnecting}
              style={{
                padding: '7px 12px', borderRadius: 8,
                border: `1px solid ${C.navyBorder}`, backgroundColor: 'transparent',
                color: C.slate, cursor: disconnecting ? 'not-allowed' : 'pointer',
                fontSize: 12, whiteSpace: 'nowrap',
                opacity: disconnecting ? 0.6 : 1,
              }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={connectTikTok}
              disabled={connecting || loading}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                backgroundColor: '#000', color: '#fff',
                cursor: (connecting || loading) ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                opacity: (connecting || loading) ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {connecting ? 'Opening TikTok…' : '+ Connect TikTok'}
            </button>
          )}
        </div>
        {tiktok && (
          <div style={{
            marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.navyBorder}`,
            fontSize: 11, color: '#4a6080',
          }}>
            Connected {new Date(tiktok.updated_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
            {' · '}open_id <code style={{ fontFamily: 'monospace' }}>{tiktok.open_id.slice(0, 12)}…</code>
          </div>
        )}
      </Card>

      {/* ── Instagram ───────────────────────────────────────────── */}
      {/* Connected server-side via IG_GRAPH_TOKEN (60-day long-lived
          token, auto-refreshes on every API call). Same pattern as
          YouTube — no per-user OAuth needed because HonestStack publishes
          to a single Meta-app-owned IG account (@honeststack). The
          posts_queue summary below is read from the live DB. */}
      <Card style={{ padding: '16px 20px', borderLeft: `3px solid ${C.green}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'linear-gradient(45deg, #F58529, #DD2A7B, #8134AF, #515BD4)',
            color: '#fff', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            flexShrink: 0,
          }}>IG</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, color: '#fff', fontWeight: 600, marginBottom: 2 }}>
              Instagram
            </div>
            <div style={{ fontSize: 12, color: C.green }}>
              ✓ Connected — publishing as @honeststack
            </div>
          </div>
          <div style={{
            fontSize: 11, color: C.slate, padding: '4px 10px',
            border: `1px solid ${C.navyBorder}`, borderRadius: 6,
          }}>
            via Graph API token
          </div>
        </div>
      </Card>
    </div>
  )
}
