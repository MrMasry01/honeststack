import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { formatDistanceToNow } from 'date-fns'

const C = {
  gold: '#F4C20D',
  navyBorder: '#243a55',
  navyLighter: '#1E3050',
  slate: '#94a3b8',
  red: '#ef4444',
  amber: '#f59e0b',
  green: '#10b981',
  blue: '#60a5fa',
}

// The raw status string lives inside the jsonb `media` column. We treat any
// asset whose media.status is 'processing' or 'rendering' as in-flight.
type AssetStatus = 'processing' | 'rendering' | 'done' | 'error' | 'unknown'

type AssetMedia = {
  status?: string
  job_id?: string
  video_url?: string
  error?: string
  visuals?: string[]
} & Record<string, unknown>

type IdeaRef = {
  hook: string | null
  time_bucket: string | null
}

type Asset = {
  id: string
  idea_id: string | null
  kind: string
  media: AssetMedia | null
  caption: string | null
  hashtags: string[]
  created_at: string
  updated_at: string
  content_ideas: IdeaRef | null
}

type QueueItem = {
  id: string
  platform: string
  publish_at: string | null
  status: string
  external_url: string | null
  posted_at: string | null
  asset_id: string | null
}

function getStatus(a: Asset): AssetStatus {
  const s = a.media?.status
  if (s === 'processing' || s === 'rendering' || s === 'done' || s === 'error') return s
  return 'unknown'
}

function getVideoUrl(media: AssetMedia | null): string | null {
  if (!media) return null
  if (typeof media.video_url === 'string') return media.video_url
  if (typeof media.url === 'string' && (media.url as string).includes('.mp4')) return media.url as string
  return null
}

function getThumbnail(media: AssetMedia | null): string | null {
  if (!media) return null
  if (typeof media.thumbnail_url === 'string') return media.thumbnail_url
  if (typeof media.thumbnail === 'string') return media.thumbnail
  return null
}

function bucketBadge(b: string | null | undefined): string {
  if (!b) return ''
  // 18-24 is the primetime bucket — call it out.
  return b === '18-24' ? 'primetime · 18-24' : b
}

export default function Videos() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [tiktokConnected, setTiktokConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  // Use a ref so the polling effect can read the latest count without
  // restarting itself on every render.
  const hasInflightRef = useRef(false)

  async function fetchData(silent = false) {
    if (!silent) setLoading(true)
    const [assetsRes, queueRes, accountsRes] = await Promise.all([
      // Join into content_ideas so we can show the hook on each render card.
      supabase
        .from('assets')
        .select('id, idea_id, kind, media, caption, hashtags, created_at, updated_at, content_ideas(hook, time_bucket)')
        .order('updated_at', { ascending: false })
        .limit(50),
      supabase
        .from('posts_queue')
        .select('id, platform, publish_at, status, external_url, posted_at, asset_id')
        .order('publish_at', { ascending: false })
        .limit(200),
      // Knowing whether TikTok is connected gates the Publish-to-TikTok button.
      supabase
        .from('social_accounts')
        .select('platform')
        .eq('platform', 'tiktok')
        .maybeSingle(),
    ])
    setAssets((assetsRes.data as unknown as Asset[]) || [])
    setQueue((queueRes.data as QueueItem[]) || [])
    setTiktokConnected(!!accountsRes.data)
    setLastRefresh(new Date())
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh: poll every 8s whenever there is at least one in-flight
  // render. As soon as everything is terminal, stop polling. We re-check
  // the inflight count by re-querying inside the interval rather than
  // restarting the interval on every state change.
  useEffect(() => {
    hasInflightRef.current = assets.some(a => {
      const s = getStatus(a)
      return s === 'processing' || s === 'rendering'
    })
  }, [assets])

  useEffect(() => {
    const interval = setInterval(() => {
      if (hasInflightRef.current) {
        fetchData(true)
      }
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <LoadingGrid />

  const inflight = assets.filter(a => {
    const s = getStatus(a)
    return s === 'processing' || s === 'rendering'
  })
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const recentErrors = assets.filter(a => {
    return getStatus(a) === 'error' && new Date(a.updated_at).getTime() > cutoff
  })
  const done = assets.filter(a => getStatus(a) === 'done')

  const isPolling = inflight.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 4 }}>
          Videos & Queue
        </h1>
        <p style={{ fontSize: 14, color: C.slate }}>
          {inflight.length > 0
            ? <><span style={{ color: C.amber, fontWeight: 600 }}>{inflight.length} rendering</span> · </>
            : null}
          {done.length} rendered · {queue.length} queue items
          {' · '}
          <span style={{ fontSize: 12, color: '#4a6080' }}>
            last refresh {formatDistanceToNow(lastRefresh, { addSuffix: true })}
            {isPolling && <> · auto-refreshing every 8s</>}
          </span>
          {' · '}
          <button
            onClick={() => fetchData(false)}
            style={{
              background: 'none',
              border: `1px solid ${C.navyBorder}`,
              color: C.slate,
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            ↻ refresh
          </button>
        </p>
      </div>

      {/* ============================================================
          IN-FLIGHT RENDERS — shown whenever something is processing/rendering
          ============================================================ */}
      {inflight.length > 0 && (
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.amber, marginBottom: 14, letterSpacing: '0.5px' }}>
            🟡 RENDERING NOW
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {inflight.map(a => <InflightCard key={a.id} asset={a} />)}
          </div>
        </section>
      )}

      {/* ============================================================
          RECENT ERRORS — last 24h failed renders, with error message
          ============================================================ */}
      {recentErrors.length > 0 && (
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 14, letterSpacing: '0.5px' }}>
            🔴 RENDER ERRORS (last 24h)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentErrors.map(a => <ErrorCard key={a.id} asset={a} onRetried={() => fetchData(true)} />)}
          </div>
        </section>
      )}

      {/* ============================================================
          RENDERED ASSETS — finished videos grid (existing behaviour)
          ============================================================ */}
      <section>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.slate, marginBottom: 14, letterSpacing: '0.5px' }}>
          ✅ RENDERED ASSETS
        </div>
        {done.length === 0 ? (
          <EmptyState message="No finished renders yet. They'll appear here when the pipeline produces a watchable MP4." />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16
          }}>
            {done.map(asset => {
              const queueForAsset = queue.filter(q => q.asset_id === asset.id)
              return (
                <DoneCard
                  key={asset.id}
                  asset={asset}
                  queueForAsset={queueForAsset}
                  tiktokConnected={tiktokConnected}
                  onPublished={() => fetchData(true)}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* ============================================================
          POSTS QUEUE — what's scheduled to publish (existing)
          ============================================================ */}
      <section>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.slate, marginBottom: 14, letterSpacing: '0.5px' }}>
          📤 POSTS QUEUE
        </div>
        {queue.length === 0 ? (
          <EmptyState message="Nothing in the posts queue yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {queue.map(item => <QueueCard key={item.id} item={item} />)}
          </div>
        )}
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function InflightCard({ asset }: { asset: Asset }) {
  const status = getStatus(asset)
  const startedAt = new Date(asset.updated_at)
  const idea = asset.content_ideas
  const visuals = asset.media?.visuals || []
  const jobId = asset.media?.job_id

  return (
    <Card style={{ padding: '14px 18px', borderLeft: `3px solid ${C.amber}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <Spinner color={C.amber} />
            <Badge label={status === 'rendering' ? 'rendering' : 'preparing'} />
            {idea?.time_bucket && (
              <span style={{ fontSize: 11, color: C.slate }}>{bucketBadge(idea.time_bucket)}</span>
            )}
          </div>
          <div style={{ fontSize: 14, color: '#fff', marginBottom: 4, fontWeight: 500, lineHeight: 1.4 }} dir="auto">
            {idea?.hook || <em style={{ color: C.slate }}>(idea metadata not loaded)</em>}
          </div>
          {visuals.length > 0 && (
            <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
              visuals: {visuals.slice(0, 4).map(v => v.replace(/^wikipedia:/, 'wiki:')).join(' · ')}
              {visuals.length > 4 && ` · +${visuals.length - 4} more`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 13, color: C.amber, fontWeight: 600 }}>
            {formatDistanceToNow(startedAt)} elapsed
          </span>
          {jobId && (
            <span style={{ fontSize: 10, color: '#4a6080', fontFamily: 'monospace' }}>
              job {jobId.slice(0, 8)}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

function ErrorCard({ asset, onRetried }: { asset: Asset; onRetried: () => void }) {
  const idea = asset.content_ideas
  const err = asset.media?.error || 'No error message recorded'
  const jobId = asset.media?.job_id
  const [expanded, setExpanded] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [retrySuccess, setRetrySuccess] = useState(false)
  const isLong = err.length > 200
  const canRetry = !!asset.idea_id

  async function handleRetry() {
    if (!asset.idea_id) return
    setRetrying(true)
    setRetryError(null)
    setRetrySuccess(false)
    // Calls retry-render edge function. The Supabase JS client automatically
    // attaches the logged-in user's JWT, which retry-render uses to verify
    // ownership of the idea before proxying to render-shortform.
    const { data, error } = await supabase.functions.invoke('retry-render', {
      body: { idea_id: asset.idea_id },
    })
    setRetrying(false)
    if (error) {
      setRetryError(error.message)
      return
    }
    const ok = (data as { ok?: boolean } | null)?.ok
    if (ok === false) {
      const msg = (data as { error?: string } | null)?.error || 'Retry was rejected'
      setRetryError(msg)
      return
    }
    setRetrySuccess(true)
    // Parent's polling will pick up the new in-flight state in a few seconds.
    onRetried()
  }

  return (
    <Card style={{ padding: '14px 18px', borderLeft: `3px solid ${C.red}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <Badge label="error" />
            {idea?.time_bucket && (
              <span style={{ fontSize: 11, color: C.slate }}>{bucketBadge(idea.time_bucket)}</span>
            )}
          </div>
          <div style={{ fontSize: 14, color: '#fff', marginBottom: 4, fontWeight: 500, lineHeight: 1.4 }} dir="auto">
            {idea?.hook || <em style={{ color: C.slate }}>(idea metadata not loaded)</em>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{ fontSize: 12, color: C.slate }}>
            {formatDistanceToNow(new Date(asset.updated_at), { addSuffix: true })}
          </span>
          {jobId && (
            <span style={{ fontSize: 10, color: '#4a6080', fontFamily: 'monospace' }}>
              job {jobId.slice(0, 8)}
            </span>
          )}
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={retrying || retrySuccess}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: `1px solid ${retrySuccess ? C.green : C.red}80`,
                backgroundColor: retrySuccess ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                color: retrySuccess ? C.green : C.red,
                cursor: (retrying || retrySuccess) ? 'not-allowed' : 'pointer',
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                opacity: retrying ? 0.7 : 1,
              }}
              title="Re-run the render pipeline for this idea"
            >
              {retrying ? 'Retrying…' : retrySuccess ? '✓ Render queued' : '↻ Retry render'}
            </button>
          )}
        </div>
      </div>
      <div style={{
        fontSize: 12,
        color: C.red,
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        padding: '8px 10px',
        borderRadius: 6,
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: expanded ? 400 : 80,
        overflow: 'auto',
      }}>
        {expanded || !isLong ? err : err.slice(0, 200) + '…'}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none',
              border: 'none',
              color: C.slate,
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {expanded ? '↑ collapse' : '↓ show full error'}
          </button>
        )}
        {retryError && (
          <span style={{ fontSize: 11, color: C.red }}>
            Retry failed: {retryError}
          </span>
        )}
      </div>
    </Card>
  )
}

function DoneCard({
  asset,
  queueForAsset,
  tiktokConnected,
  onPublished,
}: {
  asset: Asset
  queueForAsset: QueueItem[]
  tiktokConnected: boolean
  onPublished: () => void
}) {
  const videoUrl = getVideoUrl(asset.media)
  const thumb = getThumbnail(asset.media)
  const idea = asset.content_ideas

  // Per-platform publish state from posts_queue.
  const ytQueue = queueForAsset.find(q => q.platform === 'youtube')
  const ttQueue = queueForAsset.find(q => q.platform === 'tiktok')

  const [publishing, setPublishing] = useState<'youtube' | 'tiktok' | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)

  async function publish(platform: 'youtube' | 'tiktok') {
    setPublishing(platform)
    setPublishError(null)
    const fnName = platform === 'youtube' ? 'publish-youtube' : 'publish-tiktok'
    const { data, error } = await supabase.functions.invoke(fnName, {
      body: { asset_id: asset.id },
    })
    setPublishing(null)
    if (error) {
      setPublishError(`${platform}: ${error.message}`)
      return
    }
    const ok = (data as { ok?: boolean } | null)?.ok
    if (ok === false) {
      const msg = (data as { error?: string } | null)?.error || 'Publish failed'
      setPublishError(`${platform}: ${msg}`)
      return
    }
    onPublished()
  }

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        aspectRatio: '9/16',
        backgroundColor: C.navyLighter,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {videoUrl ? (
          <video
            src={videoUrl}
            poster={thumb || undefined}
            controls
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : thumb ? (
          <img src={thumb} alt="Asset thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, color: '#243a55'
          }}>🎬</div>
        )}
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
          <Badge label={asset.kind} />
        </div>
        {idea?.time_bucket && (
          <div style={{ position: 'absolute', top: 10, left: 10 }}>
            <span style={{
              fontSize: 10,
              color: C.gold,
              backgroundColor: 'rgba(0,0,0,0.6)',
              padding: '3px 7px',
              borderRadius: 4,
              fontWeight: 600,
              letterSpacing: 0.4,
            }}>
              {bucketBadge(idea.time_bucket)}
            </span>
          </div>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        {idea?.hook && (
          <p style={{
            fontSize: 13,
            color: '#fff',
            marginBottom: 6,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
            fontWeight: 500,
          }} dir="auto">
            {idea.hook}
          </p>
        )}
        {asset.caption && !idea?.hook && (
          <p style={{
            fontSize: 13,
            color: C.slate,
            marginBottom: 8,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
          }}>
            {asset.caption}
          </p>
        )}
        {asset.hashtags.length > 0 && (
          <p style={{ fontSize: 11, color: C.blue, marginBottom: 6 }}>
            {asset.hashtags.slice(0, 4).map(h => `#${h}`).join(' ')}
          </p>
        )}
        <div style={{ fontSize: 11, color: '#4a6080', marginBottom: 10 }}>
          {formatDistanceToNow(new Date(asset.created_at), { addSuffix: true })}
        </div>

        {/* ── Publish actions ─────────────────────────────────── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          paddingTop: 10,
          borderTop: `1px solid ${C.navyBorder}`,
        }}>
          {/* YouTube */}
          <PublishRow
            platform="youtube"
            label="YouTube"
            color="#FF0000"
            queue={ytQueue}
            publishing={publishing === 'youtube'}
            disabled={publishing !== null}
            onPublish={() => publish('youtube')}
          />
          {/* TikTok */}
          <PublishRow
            platform="tiktok"
            label="TikTok"
            color="#000000"
            queue={ttQueue}
            publishing={publishing === 'tiktok'}
            disabled={publishing !== null || !tiktokConnected}
            disabledHint={!tiktokConnected ? 'Connect TikTok in Connections tab' : undefined}
            onPublish={() => publish('tiktok')}
          />
          {publishError && (
            <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>
              {publishError}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function PublishRow({
  platform,
  label,
  color,
  queue,
  publishing,
  disabled,
  disabledHint,
  onPublish,
}: {
  platform: 'youtube' | 'tiktok'
  label: string
  color: string
  queue: QueueItem | undefined
  publishing: boolean
  disabled: boolean
  disabledHint?: string
  onPublish: () => void
}) {
  // posts_queue status → row appearance
  const status = queue?.status
  const isPosted = status === 'posted'
  const isPublishing = publishing || status === 'publishing'
  const isError = status === 'error'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{
        width: 24, height: 24, borderRadius: 5,
        backgroundColor: color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800, flexShrink: 0,
      }}>
        {label.slice(0, 2).toUpperCase()}
      </span>
      <span style={{ color: '#fff', fontWeight: 500, flex: 1 }}>{label}</span>
      {isPosted && queue?.external_url ? (
        <a
          href={queue.external_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, color: C.green, textDecoration: 'none',
            padding: '4px 10px', borderRadius: 6,
            border: `1px solid ${C.green}80`,
            backgroundColor: 'rgba(16,185,129,0.10)',
            whiteSpace: 'nowrap',
          }}
          title={`Posted ${queue.posted_at ? formatDistanceToNow(new Date(queue.posted_at), { addSuffix: true }) : ''}`}
        >
          ✓ Posted ↗
        </a>
      ) : isPosted ? (
        <span style={{
          fontSize: 11, color: C.green,
          padding: '4px 10px', borderRadius: 6,
          border: `1px solid ${C.green}80`,
          backgroundColor: 'rgba(16,185,129,0.10)',
        }}>
          ✓ Posted
        </span>
      ) : isPublishing ? (
        <span style={{
          fontSize: 11, color: C.amber,
          padding: '4px 10px', borderRadius: 6,
          border: `1px solid ${C.amber}80`,
          backgroundColor: 'rgba(245,158,11,0.10)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Spinner color={C.amber} /> Publishing
        </span>
      ) : (
        <button
          onClick={onPublish}
          disabled={disabled}
          title={disabledHint}
          style={{
            fontSize: 11, fontWeight: 600,
            padding: '4px 10px', borderRadius: 6,
            border: `1px solid ${isError ? C.red : C.gold}80`,
            backgroundColor: isError ? 'rgba(239,68,68,0.10)' : 'rgba(244,194,13,0.10)',
            color: isError ? C.red : C.gold,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {isError ? `↻ Retry ${platform}` : `▶ Publish to ${label}`}
        </button>
      )}
    </div>
  )
}

function QueueCard({ item }: { item: QueueItem }) {
  return (
    <Card style={{ padding: '12px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge label={item.platform} type={item.platform} />
          <Badge label={item.status} />
          {item.publish_at && (
            <span style={{ fontSize: 13, color: C.slate }}>
              {new Date(item.publish_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {item.posted_at && (
            <span style={{ fontSize: 12, color: '#4a6080' }}>
              Posted {formatDistanceToNow(new Date(item.posted_at), { addSuffix: true })}
            </span>
          )}
          {item.external_url && (
            <a
              href={item.external_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: C.gold, textDecoration: 'none' }}
            >
              View post →
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}

function Spinner({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        border: `2px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'hs-render-spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    >
      <style>{`@keyframes hs-render-spin { to { transform: rotate(360deg) } }`}</style>
    </span>
  )
}

function LoadingGrid() {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 14, letterSpacing: '0.5px' }}>RENDERED ASSETS</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ aspectRatio: '9/16', borderRadius: 12, backgroundColor: '#162438', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#4a6080' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
      <p style={{ fontSize: 14 }}>{message}</p>
    </div>
  )
}
