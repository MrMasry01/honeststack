import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { StatCard, Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { formatDistanceToNow } from 'date-fns'

const C = {
  gold: '#F4C20D',
  navyLighter: '#1E3050',
  navyBorder: '#243a55',
  slate: '#94a3b8',
}

interface OverviewData {
  rawLast24h: number
  rawTwitter: number
  rawRss: number
  ideasByStatus: Record<string, number>
  assetsCount: number
  queueByStatus: Record<string, number>
  metricsTotal: { views: number; likes: number; shares: number }
  lastIngest: string | null
  lastRender: string | null
}

const STATUS_ORDER = ['draft', 'ready', 'scheduled', 'posted']
const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  ready: '#4ade80',
  scheduled: '#60a5fa',
  posted: '#c084fc',
}

export default function Overview() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [rawAll, rawRecent, ideas, assets, queue, metrics] = await Promise.all([
        supabase.from('raw_sources').select('source_type, created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('raw_sources').select('source_type').gte('created_at', since24h),
        supabase.from('content_ideas').select('status'),
        supabase.from('assets').select('id, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(1),
        supabase.from('posts_queue').select('status'),
        supabase.from('post_metrics').select('views, likes, shares'),
      ])

      const rawRows = rawRecent.data || []
      const rawTwitter = rawRows.filter(r => r.source_type === 'twitter').length
      const rawRss = rawRows.filter(r => r.source_type === 'rss').length

      const ideaRows = ideas.data || []
      const ideasByStatus: Record<string, number> = {}
      STATUS_ORDER.forEach(s => { ideasByStatus[s] = 0 })
      ideaRows.forEach(r => { ideasByStatus[r.status] = (ideasByStatus[r.status] || 0) + 1 })

      const queueRows = queue.data || []
      const queueByStatus: Record<string, number> = {}
      queueRows.forEach(r => { queueByStatus[r.status] = (queueByStatus[r.status] || 0) + 1 })

      const metricRows = metrics.data || []
      const metricsTotal = metricRows.reduce(
        (acc, r) => ({ views: acc.views + r.views, likes: acc.likes + r.likes, shares: acc.shares + r.shares }),
        { views: 0, likes: 0, shares: 0 }
      )

      setData({
        rawLast24h: rawRows.length,
        rawTwitter,
        rawRss,
        ideasByStatus,
        assetsCount: assets.count ?? 0,
        queueByStatus,
        metricsTotal,
        lastIngest: rawAll.data?.[0]?.created_at || null,
        lastRender: assets.data?.[0]?.created_at || null,
      })
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  if (loading) return <LoadingPulse />

  if (!data) return <div style={{ color: C.slate }}>Failed to load data.</div>

  const totalIdeas = Object.values(data.ideasByStatus).reduce((a, b) => a + b, 0)
  const maxIdeas = Math.max(...Object.values(data.ideasByStatus), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 4 }}>
          Pipeline Overview
        </h1>
        <p style={{ fontSize: 14, color: C.slate }}>
          Real-time view of the WC2026 content engine
        </p>
      </div>

      {/* Health indicators */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <HealthChip
          label="Last Ingest"
          value={data.lastIngest ? formatDistanceToNow(new Date(data.lastIngest), { addSuffix: true }) : 'Never'}
          ok={data.lastIngest ? (Date.now() - new Date(data.lastIngest).getTime()) < 4 * 60 * 60 * 1000 : false}
        />
        <HealthChip
          label="Last Render"
          value={data.lastRender ? formatDistanceToNow(new Date(data.lastRender), { addSuffix: true }) : 'Never'}
          ok={data.lastRender ? (Date.now() - new Date(data.lastRender).getTime()) < 7 * 60 * 60 * 1000 : false}
        />
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <StatCard
          label="Sources (24h)"
          value={data.rawLast24h}
          sub={`${data.rawTwitter} Twitter · ${data.rawRss} RSS`}
          icon="📡"
        />
        <StatCard
          label="Ideas Total"
          value={totalIdeas}
          sub={`${data.ideasByStatus.draft || 0} drafts`}
          icon="💡"
        />
        <StatCard
          label="Videos Rendered"
          value={data.assetsCount}
          icon="🎬"
        />
        <StatCard
          label="Total Views"
          value={fmtNum(data.metricsTotal.views)}
          sub={`${fmtNum(data.metricsTotal.likes)} likes · ${fmtNum(data.metricsTotal.shares)} shares`}
          icon="👁"
          accent
        />
      </div>

      {/* Pipeline funnel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.slate, marginBottom: 16, letterSpacing: '0.3px' }}>
            IDEAS BY STATUS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {STATUS_ORDER.map(status => {
              const count = data.ideasByStatus[status] || 0
              const pct = totalIdeas > 0 ? (count / maxIdeas) * 100 : 0
              return (
                <div key={status}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Badge label={status} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{count}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, backgroundColor: C.navyLighter }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      borderRadius: 2,
                      backgroundColor: STATUS_COLORS[status],
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.slate, marginBottom: 16, letterSpacing: '0.3px' }}>
            POSTS QUEUE
          </div>
          {Object.keys(data.queueByStatus).length === 0 ? (
            <div style={{ color: '#4a6080', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
              No posts in queue
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(data.queueByStatus).map(([status, count]) => (
                <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Badge label={status} />
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{count}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.navyBorder}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.slate, marginBottom: 12, letterSpacing: '0.3px' }}>
              SOURCE MIX (24h)
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '12px', borderRadius: 8, backgroundColor: C.navyLighter }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1d9bf0' }}>{data.rawTwitter}</div>
                <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>Twitter</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center', padding: '12px', borderRadius: 8, backgroundColor: C.navyLighter }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#f97316' }}>{data.rawRss}</div>
                <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>RSS</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function HealthChip({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 16px',
      borderRadius: 8,
      backgroundColor: '#162438',
      border: `1px solid ${ok ? '#1a4a2a' : '#3a2a1a'}`,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        backgroundColor: ok ? '#4ade80' : '#f97316',
        boxShadow: ok ? '0 0 6px #4ade80' : '0 0 6px #f97316',
      }} />
      <div>
        <span style={{ fontSize: 12, color: '#64748b', marginRight: 6 }}>{label}</span>
        <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{value}</span>
      </div>
    </div>
  )
}

function fmtNum(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

function LoadingPulse() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ height: 80, borderRadius: 12, backgroundColor: '#162438', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
