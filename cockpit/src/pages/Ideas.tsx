import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/Card'
import { Badge } from '../components/Badge'
import { formatDistanceToNow } from 'date-fns'

const C = {
  gold: '#F4C20D',
  navyLight: '#162438',
  navyBorder: '#243a55',
  navyLighter: '#1E3050',
  slate: '#94a3b8',
}

type Idea = {
  id: string
  hook: string | null
  angle: string | null
  status: 'draft' | 'ready' | 'scheduled' | 'posted'
  language: string
  time_bucket: string | null
  script_segments: unknown
  brief: Record<string, unknown> | null
  urgency: number
  created_at: string
}

type Status = 'all' | 'draft' | 'ready' | 'scheduled' | 'posted'

export default function Ideas() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Status>('all')
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ hook: '', angle: '', note: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState(false)

  useEffect(() => {
    fetchIdeas()
  }, [filter])

  async function fetchIdeas() {
    setLoading(true)
    let q = supabase
      .from('content_ideas')
      .select('id, hook, angle, status, language, time_bucket, script_segments, brief, urgency, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (filter !== 'all') {
      q = q.eq('status', filter)
    }

    const { data } = await q
    setIdeas((data as Idea[]) || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.hook.trim()) {
      setFormError('Hook is required')
      return
    }
    setSubmitting(true)
    setFormError('')

    const { error } = await supabase.from('content_ideas').insert({
      hook: formData.hook.trim(),
      angle: formData.angle.trim() || null,
      status: 'draft',
      language: 'ar-EG',
      format: 'short_video',
      brief: { source: 'user', note: formData.note.trim() || null },
    })

    setSubmitting(false)
    if (error) {
      setFormError(error.message)
    } else {
      setFormSuccess(true)
      setFormData({ hook: '', angle: '', note: '' })
      setTimeout(() => { setFormSuccess(false); setShowForm(false) }, 1500)
      fetchIdeas()
    }
  }

  const statusCounts = ideas.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px', marginBottom: 4 }}>
            Content Ideas
          </h1>
          <p style={{ fontSize: 14, color: C.slate }}>
            {ideas.length} ideas · {statusCounts.draft || 0} draft · {statusCounts.ready || 0} ready
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            border: 'none',
            backgroundColor: C.gold,
            color: '#0E1B2C',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          + Add Idea
        </button>
      </div>

      {/* Add Idea Form */}
      {showForm && (
        <Card style={{ border: `1px solid ${C.gold}40` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 20 }}>
            Add Your Idea
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.3px' }}>
                HOOK <span style={{ color: '#f87171' }}>*</span>
              </label>
              <textarea
                value={formData.hook}
                onChange={e => setFormData(d => ({ ...d, hook: e.target.value }))}
                placeholder="ما هو الهوك؟ / What's the hook?"
                dir="auto"
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${C.navyBorder}`,
                  backgroundColor: C.navyLighter,
                  color: '#e2e8f0',
                  fontSize: 14,
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.3px' }}>
                ANGLE
              </label>
              <input
                value={formData.angle}
                onChange={e => setFormData(d => ({ ...d, angle: e.target.value }))}
                placeholder="الزاوية / The angle or perspective"
                dir="auto"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${C.navyBorder}`,
                  backgroundColor: C.navyLighter,
                  color: '#e2e8f0',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: '0.3px' }}>
                NOTE
              </label>
              <textarea
                value={formData.note}
                onChange={e => setFormData(d => ({ ...d, note: e.target.value }))}
                placeholder="ملاحظات إضافية / Additional notes for the engine..."
                dir="auto"
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${C.navyBorder}`,
                  backgroundColor: C.navyLighter,
                  color: '#e2e8f0',
                  fontSize: 14,
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {formError && (
              <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: '#3a1a1a', color: '#f87171', fontSize: 13 }}>
                {formError}
              </div>
            )}
            {formSuccess && (
              <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: '#1a3a2a', color: '#4ade80', fontSize: 13, fontWeight: 600 }}>
                ✓ Idea added successfully!
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: `1px solid ${C.navyBorder}`,
                  backgroundColor: 'transparent',
                  color: C.slate,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: C.gold,
                  color: '#0E1B2C',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 700,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Adding...' : 'Add Idea'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['all', 'draft', 'ready', 'scheduled', 'posted'] as Status[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 16px',
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
            {f} {f !== 'all' && statusCounts[f] !== undefined ? `(${statusCounts[f]})` : ''}
          </button>
        ))}
      </div>

      {/* Ideas list */}
      {loading ? (
        <LoadingRows />
      ) : ideas.length === 0 ? (
        <EmptyState message="No ideas yet. Add your first idea or wait for the engine to draft some." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ideas.map(idea => {
            const segments = Array.isArray(idea.script_segments) ? idea.script_segments.length : 0
            const virality = idea.brief && typeof idea.brief === 'object'
              ? (idea.brief as Record<string, unknown>).virality_score ?? null
              : null

            return (
              <Card key={idea.id} style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                      <Badge label={idea.status} />
                      {idea.language === 'ar-EG' && (
                        <span style={{ fontSize: 11, color: '#60a5fa', backgroundColor: '#1a2a4a', padding: '1px 8px', borderRadius: 10, fontWeight: 500 }}>
                          AR
                        </span>
                      )}
                      {idea.time_bucket && (
                        <span style={{ fontSize: 11, color: C.slate }}>{idea.time_bucket}</span>
                      )}
                      <span style={{ fontSize: 11, color: C.slate, marginLeft: 'auto' }}>
                        {formatDistanceToNow(new Date(idea.created_at), { addSuffix: true })}
                      </span>
                    </div>

                    {idea.hook && (
                      <p dir="auto" style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 6, lineHeight: 1.4 }}>
                        {idea.hook}
                      </p>
                    )}
                    {idea.angle && (
                      <p style={{ fontSize: 13, color: C.slate, marginBottom: 8, lineHeight: 1.4 }}>
                        {idea.angle}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {segments > 0 && (
                        <span style={{ fontSize: 12, color: '#4a6080' }}>{segments} script segments</span>
                      )}
                      {virality !== null && (
                        <span style={{ fontSize: 12, color: '#f97316' }}>
                          🔥 Virality: {String(virality)}
                        </span>
                      )}
                      <UrgencyDots urgency={idea.urgency} />
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function UrgencyDots({ urgency }: { urgency: number }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: '#4a6080', marginRight: 4 }}>Urgency</span>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: i <= urgency ? '#F4C20D' : '#243a55',
        }} />
      ))}
    </div>
  )
}

function LoadingRows() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{ height: 90, borderRadius: 12, backgroundColor: '#162438', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#4a6080' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>💡</div>
      <p style={{ fontSize: 14 }}>{message}</p>
    </div>
  )
}
