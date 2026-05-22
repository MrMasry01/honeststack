import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { formatDistanceToNow } from 'date-fns'

const C = {
  gold: '#F4C20D',
  navyBorder: '#243a55',
  slate: '#94a3b8',
  navyLighter: '#1E3050',
}

type Source = {
  id: string
  source_type: 'twitter' | 'rss'
  source_handle: string | null
  content: string | null
  verified: boolean
  url: string | null
  author: string | null
  created_at: string
}

type Filter = 'all' | 'twitter' | 'rss'

export default function Sources() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)

  const PAGE_SIZE = 30

  useEffect(() => {
    fetchSources()
  }, [filter, page])

  async function fetchSources() {
    setLoading(true)
    let q = supabase
      .from('raw_sources')
      .select('id, source_type, source_handle, content, verified, url, author, created_at')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filter !== 'all') {
      q = q.eq('source_type', filter)
    }

    const { data } = await q
    setSources(data || [])
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 4 }}>
            Raw Sources
          </h1>
          <p style={{ fontSize: 14, color: C.slate }}>Scraped content from Twitter & RSS</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['all', 'twitter', 'rss'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(0) }}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                border: `1px solid ${filter === f ? C.gold : C.navyBorder}`,
                backgroundColor: filter === f ? 'rgba(244,194,13,0.1)' : 'transparent',
                color: filter === f ? C.gold : C.slate,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: filter === f ? 600 : 400,
                textTransform: 'capitalize',
              }}
            >
              {f === 'all' ? 'All' : f === 'twitter' ? '🐦 Twitter' : '📰 RSS'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingRows />
      ) : sources.length === 0 ? (
        <EmptyState message="No sources found. Ingest pipeline hasn't run yet." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sources.map(src => (
            <Card key={src.id} style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0 }}>
                  <Badge label={src.source_type} type={src.source_type} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    {src.source_handle && (
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                        @{src.source_handle}
                      </span>
                    )}
                    {src.author && src.author !== src.source_handle && (
                      <span style={{ fontSize: 12, color: C.slate }}>by {src.author}</span>
                    )}
                    {src.verified && (
                      <span style={{
                        fontSize: 11, color: '#4ade80',
                        backgroundColor: '#1a3a2a',
                        padding: '1px 8px', borderRadius: 10, fontWeight: 600
                      }}>✓ Verified</span>
                    )}
                  </div>
                  {src.content && (
                    <p style={{
                      fontSize: 14,
                      color: '#94a3b8',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      marginBottom: 8,
                    }}>
                      {src.content}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#4a6080' }}>
                      {formatDistanceToNow(new Date(src.created_at), { addSuffix: true })}
                    </span>
                    {src.url && (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, color: C.gold, textDecoration: 'none' }}
                      >
                        View source →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && sources.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8 }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={paginationBtn(page === 0)}
          >
            ← Previous
          </button>
          <span style={{ fontSize: 13, color: C.slate, padding: '8px 0' }}>Page {page + 1}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={sources.length < PAGE_SIZE}
            style={paginationBtn(sources.length < PAGE_SIZE)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

function paginationBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 18px',
    borderRadius: 8,
    border: '1px solid #243a55',
    backgroundColor: 'transparent',
    color: disabled ? '#4a6080' : '#94a3b8',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
  }
}

function LoadingRows() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[...Array(8)].map((_, i) => (
        <div key={i} style={{ height: 80, borderRadius: 12, backgroundColor: '#162438', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#4a6080' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
      <p style={{ fontSize: 14 }}>{message}</p>
    </div>
  )
}
