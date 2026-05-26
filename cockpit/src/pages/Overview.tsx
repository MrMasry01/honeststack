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
        // Query the latest-per-post view — post_metrics is now append-only
        // for time-series, so summing the raw table would double-count
        // every snapshot. The view returns one row per post (latest).
        supabase.from('latest_post_metrics').select('views, likes, shares'),
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

      {/* Pipeline health — red banner if anything is silently broken.
          Updated every 30 min by hs-heartbeat-watchdog cron. */}
      <HealthBanner />

      {/* Next pipeline run — when fresh ideas/renders/posts will appear */}
      <NextRunCard />

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

// ─────────────────────────────────────────────────────────────────────────────
// HealthBanner — surfaces system_health row populated by the
// heartbeat-watchdog cron every 30 min. Only renders when issues
// exist; otherwise stays out of the way.
// ─────────────────────────────────────────────────────────────────────────────
interface HealthCheck {
  name: string
  ok: boolean
  value: string | number | null
  threshold: string
  message: string
}
interface SystemHealth {
  ok: boolean
  checks: HealthCheck[]
  issues: HealthCheck[]
  ran_at: string
}

function HealthBanner() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('system_health')
        .select('ok, checks, issues, ran_at')
        .eq('id', 'singleton')
        .maybeSingle()
      if (data) setHealth(data as unknown as SystemHealth)
    })()
  }, [])

  if (!health || health.ok) return null  // hide when green

  return (
    <div style={{
      padding: '14px 18px',
      borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.08) 100%)',
      border: '1px solid rgba(239,68,68,0.45)',
      display: 'flex',
      gap: 14,
      alignItems: 'flex-start',
    }}>
      <div style={{ fontSize: 22, lineHeight: 1 }}>⚠️</div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: '#fca5a5',
          letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6,
        }}>
          Pipeline health — {health.issues.length} issue{health.issues.length === 1 ? '' : 's'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {health.issues.map((c) => (
            <div key={c.name} style={{
              fontSize: 13, color: '#fee2e2',
              padding: '4px 0',
              borderBottom: '1px solid rgba(239,68,68,0.2)',
            }}>
              <strong style={{ color: '#fff' }}>{c.name}:</strong> {c.message}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>
          Last checked {formatDistanceToNow(new Date(health.ran_at), { addSuffix: true })} · re-runs every 30 min
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NextRunCard — when fresh content will appear next.
//
// The pipeline runs as a single 6-hour beat:
//   • Ingest fires at minute 0 of 05/11/17/23 UTC (Twitter + RSS)
//   • Editorial brief fires at minute 30 of the same hours (creates a
//     content_idea with status='ready' — auto-approved as of v21)
//   • Auto-scheduler (every 5 min) picks the ready idea and triggers
//     render-shortform → Remotion (Railway, ~3 min)
//   • Auto-scheduler then publishes to YT + TikTok + Instagram on its
//     next ticks (one platform per tick)
//
// The "next pipeline run" the operator cares about is the editorial
// brief — because that's the moment a new idea materialises. Everything
// downstream is automatic and quick (~10-15 min from brief to all 3
// platforms posted).
// ─────────────────────────────────────────────────────────────────────────────

// Schedule constants — match what's in pg_cron exactly.
const EDITORIAL_HOURS_UTC = [5, 11, 17, 23]; // xx:30 each
const INGEST_HOURS_UTC = [5, 11, 17, 23];    // xx:00 each
const EDITORIAL_MINUTE_UTC = 30;
const INGEST_MINUTE_UTC = 0;

/** Compute the next UTC Date for a given list of hours + minute. */
function nextScheduledRun(hoursUtc: number[], minuteUtc: number): Date {
  const now = new Date()
  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    for (const hour of hoursUtc) {
      const candidate = new Date(now)
      candidate.setUTCDate(now.getUTCDate() + dayOffset)
      candidate.setUTCHours(hour, minuteUtc, 0, 0)
      if (candidate.getTime() > now.getTime()) return candidate
    }
  }
  // Shouldn't reach here, but return a safe fallback
  const fallback = new Date(now)
  fallback.setUTCDate(now.getUTCDate() + 1)
  fallback.setUTCHours(hoursUtc[0], minuteUtc, 0, 0)
  return fallback
}

/** "2h 17m" / "47m" / "32s" countdown string. */
function fmtCountdown(target: Date, now: Date): string {
  const deltaMs = target.getTime() - now.getTime()
  if (deltaMs <= 0) return 'any moment'
  const totalSec = Math.floor(deltaMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtClock(d: Date, tz: string, label: string): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d)
  return `${time} ${label}`
}

function NextRunCard() {
  const [now, setNow] = useState<Date>(() => new Date())

  // Tick every second so the countdown stays live.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const nextEditorial = nextScheduledRun(EDITORIAL_HOURS_UTC, EDITORIAL_MINUTE_UTC)
  const nextIngest = nextScheduledRun(INGEST_HOURS_UTC, INGEST_MINUTE_UTC)
  // The editorial run is the operator-facing "new content" moment.
  const editorialCountdown = fmtCountdown(nextEditorial, now)

  // Estimated end-of-flow timestamp: editorial + 15 min covers render
  // (~3 min) + 3 publish ticks (each on a 5-min cron boundary).
  const estimatedPosted = new Date(nextEditorial.getTime() + 15 * 60 * 1000)

  return (
    <div style={{
      padding: '20px 24px',
      borderRadius: 14,
      background: `linear-gradient(135deg, ${C.navyLighter} 0%, #16243a 100%)`,
      border: `1px solid ${C.gold}40`,
      boxShadow: `0 0 24px ${C.gold}15`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        {/* Big countdown */}
        <div style={{ flex: '0 0 auto', minWidth: 200 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: C.gold,
            letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8,
          }}>
            ⏱ Next Pipeline Run
          </div>
          <div style={{
            fontSize: 38, fontWeight: 800, color: '#fff',
            lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            marginBottom: 6,
          }}>
            {editorialCountdown}
          </div>
          <div style={{ fontSize: 12, color: C.slate }}>
            until next editorial brief
          </div>
        </div>

        {/* Sequence breakdown */}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: C.slate,
            letterSpacing: 0.4, marginBottom: 10,
          }}>
            WHAT&apos;S HAPPENING NEXT
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <RunRow
              dot="#60a5fa"
              label="Ingest (Twitter + RSS)"
              time={fmtClock(nextIngest, 'UTC', 'UTC')}
              alt={fmtClock(nextIngest, 'Africa/Cairo', 'Cairo')}
            />
            <RunRow
              dot={C.gold}
              label="Editorial brief (new idea)"
              time={fmtClock(nextEditorial, 'UTC', 'UTC')}
              alt={fmtClock(nextEditorial, 'Africa/Cairo', 'Cairo')}
              highlight
            />
            <RunRow
              dot="#c084fc"
              label="Render starts"
              time="~5 min after editorial"
              alt="auto-scheduler picks up"
            />
            <RunRow
              dot="#4ade80"
              label="Posted to YT + TT + IG"
              time={`~ ${fmtClock(estimatedPosted, 'UTC', 'UTC')}`}
              alt={`${fmtClock(estimatedPosted, 'Africa/Cairo', 'Cairo')}`}
            />
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 14, paddingTop: 12,
        borderTop: `1px solid ${C.navyBorder}`,
        fontSize: 11, color: '#5a708d', display: 'flex',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <span>Auto-scheduler runs every 5 min · refresh-metrics every 30 min</span>
        <span>Schedules: ingest at 05/11/17/23:00 UTC · brief at :30</span>
      </div>
    </div>
  )
}

function RunRow({
  dot, label, time, alt, highlight,
}: {
  dot: string; label: string; time: string; alt?: string; highlight?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: highlight ? '6px 10px' : '4px 0',
      borderRadius: highlight ? 6 : 0,
      backgroundColor: highlight ? 'rgba(244,194,13,0.08)' : 'transparent',
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: dot, boxShadow: `0 0 6px ${dot}80`,
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 13, color: highlight ? '#fff' : '#cbd5e1',
        fontWeight: highlight ? 600 : 500, flex: 1,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 12, color: highlight ? '#F4C20D' : C.slate,
        fontWeight: highlight ? 700 : 500,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'right',
      }}>
        {time}
        {alt && (
          <span style={{ display: 'block', fontSize: 10, color: '#5a708d', fontWeight: 400 }}>
            {alt}
          </span>
        )}
      </span>
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
