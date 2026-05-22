import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { formatDistanceToNow } from 'date-fns'

const C = {
  gold: '#F4C20D',
  navyBorder: '#243a55',
  navyLighter: '#1E3050',
  slate: '#94a3b8',
}

type Asset = {
  id: string
  kind: string
  media: Record<string, unknown> | null
  caption: string | null
  hashtags: string[]
  created_at: string
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

export default function Videos() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [assetsRes, queueRes] = await Promise.all([
      supabase.from('assets').select('id, kind, media, caption, hashtags, created_at').order('created_at', { ascending: false }).limit(24),
      supabase.from('posts_queue').select('id, platform, publish_at, status, external_url, posted_at, asset_id').order('publish_at', { ascending: false }).limit(30),
    ])
    setAssets((assetsRes.data as Asset[]) || [])
    setQueue((queueRes.data as QueueItem[]) || [])
    setLoading(false)
  }

  function getVideoUrl(media: Record<string, unknown> | null): string | null {
    if (!media) return null
    if (typeof media.video_url === 'string') return media.video_url
    if (typeof media.url === 'string' && (media.url as string).includes('.mp4')) return media.url as string
    return null
  }

  function getThumbnail(media: Record<string, unknown> | null): string | null {
    if (!media) return null
    if (typeof media.thumbnail_url === 'string') return media.thumbnail_url
    if (typeof media.thumbnail === 'string') return media.thumbnail
    return null
  }

  if (loading) return <LoadingGrid />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 4 }}>
          Videos & Queue
        </h1>
        <p style={{ fontSize: 14, color: C.slate }}>
          {assets.length} rendered assets · {queue.length} queue items
        </p>
      </div>

      {/* Assets grid */}
      <section>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.slate, marginBottom: 14, letterSpacing: '0.5px' }}>
          RENDERED ASSETS
        </div>
        {assets.length === 0 ? (
          <EmptyState message="No assets rendered yet. The render pipeline hasn't produced videos." />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 16
          }}>
            {assets.map(asset => {
              const videoUrl = getVideoUrl(asset.media)
              const thumb = getThumbnail(asset.media)

              return (
                <Card key={asset.id} style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Video or placeholder */}
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
                      <img
                        src={thumb}
                        alt="Asset thumbnail"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 36, color: '#243a55'
                      }}>
                        🎬
                      </div>
                    )}
                    <div style={{
                      position: 'absolute', top: 10, right: 10,
                    }}>
                      <Badge label={asset.kind} />
                    </div>
                  </div>

                  <div style={{ padding: '12px 14px' }}>
                    {asset.caption && (
                      <p style={{
                        fontSize: 13,
                        color: '#94a3b8',
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
                      <p style={{ fontSize: 11, color: '#60a5fa', marginBottom: 6 }}>
                        {asset.hashtags.slice(0, 4).map(h => `#${h}`).join(' ')}
                      </p>
                    )}
                    <div style={{ fontSize: 11, color: '#4a6080' }}>
                      {formatDistanceToNow(new Date(asset.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* Posts queue */}
      <section>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.slate, marginBottom: 14, letterSpacing: '0.5px' }}>
          POSTS QUEUE
        </div>
        {queue.length === 0 ? (
          <EmptyState message="Nothing in the posts queue yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {queue.map(item => (
              <Card key={item.id} style={{ padding: '12px 18px' }}>
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
            ))}
          </div>
        )}
      </section>
    </div>
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
