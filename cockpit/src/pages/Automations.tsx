import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'
import { formatDistanceToNow } from 'date-fns'

const C = {
  gold: '#F4C20D',
  navyLight: '#162438',
  navyBorder: '#243a55',
  navyLighter: '#1E3050',
  slate: '#94a3b8',
}

interface AutomationHealth {
  lastIngest: string | null
  lastRender: string | null
  ingestCount24h: number
  renderCount24h: number
}

interface Automation {
  name: string
  type: 'make' | 'edge' | 'service'
  description: string
  cadence: string
  makeId?: number
  makeUrl?: string
  status: 'active' | 'unknown'
  freshnessKey: keyof AutomationHealth | null
  freshnessLabel: string
  freshnessTtlHours: number
}

const AUTOMATIONS: Automation[] = [
  {
    name: 'Ingest Twitter',
    type: 'make',
    description: 'Scrapes Twitter/X for World Cup news from target handles',
    cadence: 'Every 3 hours',
    makeId: 5844012,
    makeUrl: 'https://eu1.make.com',
    status: 'active',
    freshnessKey: 'lastIngest',
    freshnessLabel: 'Last Twitter ingest',
    freshnessTtlHours: 4,
  },
  {
    name: 'Ingest RSS',
    type: 'make',
    description: 'Pulls RSS feeds from football news sources',
    cadence: 'Every 3 hours',
    makeId: 5844074,
    makeUrl: 'https://eu1.make.com',
    status: 'active',
    freshnessKey: 'lastIngest',
    freshnessLabel: 'Last RSS ingest',
    freshnessTtlHours: 4,
  },
  {
    name: 'Render Videos',
    type: 'make',
    description: 'Triggers Remotion render for ready content ideas',
    cadence: 'Every 6 hours',
    status: 'active',
    freshnessKey: 'lastRender',
    freshnessLabel: 'Last render',
    freshnessTtlHours: 7,
  },
  {
    name: 'ingest-twitter',
    type: 'edge',
    description: 'Supabase Edge Function — processes raw Twitter data into raw_sources',
    cadence: 'On trigger',
    status: 'active',
    freshnessKey: 'lastIngest',
    freshnessLabel: 'Last run',
    freshnessTtlHours: 4,
  },
  {
    name: 'ingest-rss',
    type: 'edge',
    description: 'Supabase Edge Function — processes RSS feed data into raw_sources',
    cadence: 'On trigger',
    status: 'active',
    freshnessKey: 'lastIngest',
    freshnessLabel: 'Last run',
    freshnessTtlHours: 4,
  },
  {
    name: 'render-shortform',
    type: 'edge',
    description: 'Supabase Edge Function — renders a ready content idea into an MP4 via Remotion',
    cadence: 'On trigger',
    status: 'active',
    freshnessKey: 'lastRender',
    freshnessLabel: 'Last run',
    freshnessTtlHours: 7,
  },
  {
    name: 'Remotion Render Service',
    type: 'service',
    description: 'Cloud render service that produces MP4 short-form videos from React templates',
    cadence: 'On demand',
    status: 'active',
    freshnessKey: 'lastRender',
    freshnessLabel: 'Last render',
    freshnessTtlHours: 7,
  },
]

const TYPE_LABELS: Record<string, string> = {
  make: 'Make Scenario',
  edge: 'Edge Function',
  service: 'Render Service',
}

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  make: { bg: '#1a2a4a', color: '#60a5fa' },
  edge: { bg: '#1a3a2a', color: '#4ade80' },
  service: { bg: '#2a1a3a', color: '#c084fc' },
}

export default function Automations() {
  const [health, setHealth] = useState<AutomationHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHealth()
  }, [])

  async function fetchHealth() {
    setLoading(true)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [lastSrc, lastAsset, srcCount, assetCount] = await Promise.all([
      supabase.from('raw_sources').select('created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('assets').select('created_at').order('created_at', { ascending: false }).limit(1),
      supabase.from('raw_sources').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
      supabase.from('assets').select('id', { count: 'exact', head: true }).gte('created_at', since24h),
    ])

    setHealth({
      lastIngest: lastSrc.data?.[0]?.created_at || null,
      lastRender: lastAsset.data?.[0]?.created_at || null,
      ingestCount24h: srcCount.count || 0,
      renderCount24h: assetCount.count || 0,
    })
    setLoading(false)
  }

  function isFresh(tsStr: string | null, ttlHours: number): boolean {
    if (!tsStr) return false
    return (Date.now() - new Date(tsStr).getTime()) < ttlHours * 60 * 60 * 1000
  }

  function freshnessValue(key: keyof AutomationHealth | null): string {
    if (!key || !health) return 'Unknown'
    const v = health[key]
    if (!v) return 'Never'
    if (typeof v === 'number') return `${v} (24h)`
    return formatDistanceToNow(new Date(v), { addSuffix: true })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 4 }}>
          Automations
        </h1>
        <p style={{ fontSize: 14, color: C.slate }}>
          Engine health — all automations powering the WC2026 pipeline
        </p>
      </div>

      {/* Health summary */}
      {!loading && health && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <Card>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
              Sources ingested (24h)
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#1d9bf0', letterSpacing: '-0.5px' }}>
              {health.ingestCount24h}
            </div>
            {health.lastIngest && (
              <div style={{ fontSize: 12, color: '#4a6080', marginTop: 4 }}>
                Last: {formatDistanceToNow(new Date(health.lastIngest), { addSuffix: true })}
              </div>
            )}
          </Card>
          <Card>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
              Videos rendered (24h)
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: C.gold, letterSpacing: '-0.5px' }}>
              {health.renderCount24h}
            </div>
            {health.lastRender && (
              <div style={{ fontSize: 12, color: '#4a6080', marginTop: 4 }}>
                Last: {formatDistanceToNow(new Date(health.lastRender), { addSuffix: true })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Automation cards */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.slate, marginBottom: 14, letterSpacing: '0.5px' }}>
          ALL AUTOMATIONS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {AUTOMATIONS.map(auto => {
            const tsKey = auto.freshnessKey
            const tsStr = tsKey && health ? (health[tsKey] as string | null) : null
            const fresh = isFresh(tsStr, auto.freshnessTtlHours)
            const typeStyle = TYPE_COLORS[auto.type]

            return (
              <Card key={auto.name} style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '2px 10px', borderRadius: 20,
                        backgroundColor: typeStyle.bg, color: typeStyle.color,
                        letterSpacing: '0.3px',
                      }}>
                        {TYPE_LABELS[auto.type]}
                      </span>
                      <StatusDot fresh={fresh} loading={loading} />
                    </div>

                    <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4, fontFamily: auto.type === 'edge' ? 'monospace' : 'inherit' }}>
                      {auto.name}
                      {auto.makeId && <span style={{ fontSize: 12, color: '#4a6080', fontFamily: 'monospace', marginLeft: 8 }}>#{auto.makeId}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: C.slate, marginBottom: 10 }}>
                      {auto.description}
                    </div>

                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ fontSize: 11, color: '#4a6080' }}>Cadence: </span>
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>{auto.cadence}</span>
                      </div>
                      {!loading && (
                        <div>
                          <span style={{ fontSize: 11, color: '#4a6080' }}>{auto.freshnessLabel}: </span>
                          <span style={{ fontSize: 12, color: fresh ? '#4ade80' : '#f97316', fontWeight: 500 }}>
                            {freshnessValue(auto.freshnessKey)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  {auto.makeUrl && (
                    <a
                      href={auto.makeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: `1px solid ${C.navyBorder}`,
                        backgroundColor: 'transparent',
                        color: C.slate,
                        fontSize: 13,
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Open in Make ↗
                    </a>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '16px', borderRadius: 10, backgroundColor: '#0a1420', border: `1px solid ${C.navyBorder}`, fontSize: 13, color: '#4a6080' }}>
        <strong style={{ color: C.slate }}>Note:</strong> Activate/pause Make scenarios directly at{' '}
        <a href="https://make.com" target="_blank" rel="noopener noreferrer" style={{ color: C.gold }}>make.com</a>.
        This view shows freshness signals derived from database activity.
      </div>
    </div>
  )
}

function StatusDot({ fresh, loading }: { fresh: boolean; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#4a6080' }} />
    )
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        backgroundColor: fresh ? '#4ade80' : '#f97316',
        boxShadow: fresh ? '0 0 5px #4ade80' : '0 0 5px #f97316',
      }} />
      <span style={{ fontSize: 11, color: fresh ? '#4ade80' : '#f97316', fontWeight: 600 }}>
        {fresh ? 'Healthy' : 'Stale'}
      </span>
    </div>
  )
}
