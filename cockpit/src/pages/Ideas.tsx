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
  red: '#f87171',
  green: '#4ade80',
}

type ScriptSegment = {
  text?: string             // narration — what TTS reads
  caption_ar?: string       // on-screen overlay — short clickbait
  image_prompt_or_url?: string
  image_prompt?: string
  image_url?: string
  duration_ms?: number
  duration_hint_s?: number
}

type Brief = {
  stories?: string[]
  summary_en?: string
  virality_score?: number
  source_ids?: string[]
  verification?: string
  cta?: string
} & Record<string, unknown>

type Idea = {
  id: string
  hook: string | null
  angle: string | null
  status: 'draft' | 'ready' | 'scheduled' | 'posted'
  language: string
  time_bucket: string | null
  script_segments: ScriptSegment[] | null
  brief: Brief | null
  urgency: number
  created_at: string
}

type Status = 'all' | 'draft' | 'ready' | 'scheduled' | 'posted'

// Pull stories out of brief in a tolerant way — old briefs may not have it.
function getStories(brief: Brief | null): string[] {
  if (!brief) return []
  if (Array.isArray(brief.stories)) return brief.stories.filter(s => typeof s === 'string' && s.trim())
  return []
}

// Normalise per-segment image field. The skill writes image_prompt_or_url,
// but legacy rows may have image_prompt or image_url instead.
function getSegImage(s: ScriptSegment): string {
  return (s.image_prompt_or_url ?? s.image_prompt ?? s.image_url ?? '').trim()
}

function getSegDurationMs(s: ScriptSegment): number {
  if (typeof s.duration_ms === 'number') return s.duration_ms
  if (typeof s.duration_hint_s === 'number') return Math.round(s.duration_hint_s * 1000)
  return 8000
}

// Classify the segment's image source for the inline preview chip.
function imageTier(raw: string): { tier: 'url' | 'person' | 'ai' | 'empty'; label: string; icon: string } {
  if (!raw) return { tier: 'empty', label: '(no image set)', icon: '⚠️' }
  if (/^https?:\/\//i.test(raw)) {
    // Show just the host + last path segment so the row stays compact.
    try {
      const u = new URL(raw)
      const tail = u.pathname.split('/').filter(Boolean).pop() ?? ''
      return { tier: 'url', label: `${u.host} / ${tail}`, icon: '🖼' }
    } catch {
      return { tier: 'url', label: raw.slice(0, 60), icon: '🖼' }
    }
  }
  const personMatch = /^person:\s*(.+)$/i.exec(raw)
  if (personMatch) return { tier: 'person', label: personMatch[1].trim(), icon: '👤' }
  return { tier: 'ai', label: raw.length > 80 ? raw.slice(0, 80) + '…' : raw, icon: '🎨' }
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  async function fetchIdeas(silent = false) {
    if (!silent) setLoading(true)
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
    if (!silent) setLoading(false)
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
            <FormField label="HOOK *" required>
              <textarea
                value={formData.hook}
                onChange={e => setFormData(d => ({ ...d, hook: e.target.value }))}
                placeholder="ما هو الهوك؟ / What's the hook?"
                dir="auto"
                rows={2}
                style={inputStyle}
              />
            </FormField>
            <FormField label="ANGLE">
              <input
                value={formData.angle}
                onChange={e => setFormData(d => ({ ...d, angle: e.target.value }))}
                placeholder="الزاوية / The angle or perspective"
                dir="auto"
                style={inputStyle}
              />
            </FormField>
            <FormField label="NOTE">
              <textarea
                value={formData.note}
                onChange={e => setFormData(d => ({ ...d, note: e.target.value }))}
                placeholder="ملاحظات إضافية / Additional notes for the engine..."
                dir="auto"
                rows={3}
                style={inputStyle}
              />
            </FormField>

            {formError && (
              <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: '#3a1a1a', color: C.red, fontSize: 13 }}>
                {formError}
              </div>
            )}
            {formSuccess && (
              <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: '#1a3a2a', color: C.green, fontSize: 13, fontWeight: 600 }}>
                ✓ Idea added successfully!
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{ ...btnPrimary, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
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
          {ideas.map(idea => (
            <IdeaCard key={idea.id} idea={idea} onChanged={() => fetchIdeas(true)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// IdeaCard — per-row component with own expand/edit state
// ─────────────────────────────────────────────────────────────────────────────

function IdeaCard({ idea, onChanged }: { idea: Idea; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [actioning, setActioning] = useState<'approve' | 'revert' | null>(null)

  // Local working copy for edits. Reset whenever the row changes underneath us.
  const [draftHook, setDraftHook] = useState(idea.hook ?? '')
  const [draftSegments, setDraftSegments] = useState<ScriptSegment[]>(
    () => (idea.script_segments ?? []).map(s => ({
      text: s.text ?? '',
      caption_ar: s.caption_ar ?? '',
      image_prompt_or_url: getSegImage(s),
      duration_ms: getSegDurationMs(s),
    }))
  )

  // Keep local edit state in sync when the source row updates (e.g. after a save).
  useEffect(() => {
    if (!editing) {
      setDraftHook(idea.hook ?? '')
      setDraftSegments((idea.script_segments ?? []).map(s => ({
        text: s.text ?? '',
        caption_ar: s.caption_ar ?? '',
        image_prompt_or_url: getSegImage(s),
        duration_ms: getSegDurationMs(s),
      })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea.id, idea.hook, idea.script_segments, editing])

  const stories = getStories(idea.brief)
  const segments = Array.isArray(idea.script_segments) ? idea.script_segments : []
  const virality = idea.brief?.virality_score
  const isDraft = idea.status === 'draft'
  const isReady = idea.status === 'ready'

  async function updateStatus(next: 'draft' | 'ready') {
    setActioning(next === 'ready' ? 'approve' : 'revert')
    setSaveError(null)
    const { error } = await supabase.from('content_ideas').update({ status: next }).eq('id', idea.id)
    setActioning(null)
    if (error) {
      setSaveError(error.message)
    } else {
      onChanged()
    }
  }

  async function saveEdits(opts: { approve: boolean }) {
    // Sanity-check before save.
    if (!draftHook.trim()) {
      setSaveError('Hook cannot be empty')
      return
    }
    const cleaned = draftSegments
      .map(s => ({
        text: (s.text ?? '').trim(),
        caption_ar: (s.caption_ar ?? '').trim(),
        image_prompt_or_url: (s.image_prompt_or_url ?? '').trim(),
        duration_ms: Math.max(1000, Math.min(30000, Number(s.duration_ms) || 8000)),
      }))
      .filter(s => s.text)

    if (cleaned.length === 0) {
      setSaveError('At least one segment with text is required')
      return
    }

    setSaving(true)
    setSaveError(null)
    const patch: Record<string, unknown> = {
      hook: draftHook.trim(),
      script_segments: cleaned,
    }
    if (opts.approve) patch.status = 'ready'

    const { error } = await supabase.from('content_ideas').update(patch).eq('id', idea.id)
    setSaving(false)

    if (error) {
      setSaveError(error.message)
    } else {
      setEditing(false)
      onChanged()
    }
  }

  function discardEdits() {
    setDraftHook(idea.hook ?? '')
    setDraftSegments((idea.script_segments ?? []).map(s => ({
      text: s.text ?? '',
      caption_ar: s.caption_ar ?? '',
      image_prompt_or_url: getSegImage(s),
      duration_ms: getSegDurationMs(s),
    })))
    setEditing(false)
    setSaveError(null)
  }

  function setSegment(i: number, patch: Partial<ScriptSegment>) {
    setDraftSegments(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }

  function removeSegment(i: number) {
    setDraftSegments(prev => prev.filter((_, idx) => idx !== i))
  }

  function addSegment() {
    setDraftSegments(prev => [
      ...prev,
      { text: '', caption_ar: '', image_prompt_or_url: '', duration_ms: 8000 }
    ])
  }

  function moveSegment(i: number, dir: -1 | 1) {
    setDraftSegments(prev => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      const tmp = next[i]
      next[i] = next[j]
      next[j] = tmp
      return next
    })
  }

  return (
    <Card style={{
      padding: '16px 18px',
      borderLeft: isReady
        ? `3px solid ${C.green}`
        : isDraft
          ? `3px solid ${C.gold}50`
          : `3px solid ${C.navyBorder}`,
    }}>
      {/* ── Header row: badges + actions ────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <Badge label={idea.status} />
            {idea.language === 'ar-EG' && (
              <span style={{ fontSize: 11, color: '#60a5fa', backgroundColor: '#1a2a4a', padding: '1px 8px', borderRadius: 10, fontWeight: 500 }}>
                AR
              </span>
            )}
            {/* time_bucket is internal editorial targeting metadata (not on
                video). Hidden from cockpit per chief-editor cleanup. */}
            <span style={{ fontSize: 11, color: C.slate, marginLeft: 'auto' }}>
              {formatDistanceToNow(new Date(idea.created_at), { addSuffix: true })}
            </span>
          </div>

          {/* ── Hook (view or edit) ─────────────────────────────────── */}
          {editing ? (
            <FormField label="HOOK">
              <textarea
                value={draftHook}
                onChange={e => setDraftHook(e.target.value)}
                dir="auto"
                rows={2}
                style={inputStyle}
              />
            </FormField>
          ) : (
            idea.hook && (
              <p dir="auto" style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 6, lineHeight: 1.4 }}>
                {idea.hook}
              </p>
            )
          )}

          {idea.angle && !editing && (
            <p style={{ fontSize: 13, color: C.slate, marginBottom: 8, lineHeight: 1.4 }}>
              {idea.angle}
            </p>
          )}

          {/* ── Stories bullets — what's actually IN this script ─────── */}
          {stories.length > 0 && !editing && (
            <div style={{ marginTop: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.slate, letterSpacing: '0.4px', marginBottom: 6 }}>
                STORIES IN THIS ROUNDUP
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 13, lineHeight: 1.55 }}>
                {stories.map((s, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Meta row: segment count, virality, urgency ──────────── */}
          {!editing && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
              {segments.length > 0 && (
                <span style={{ fontSize: 12, color: '#4a6080' }}>{segments.length} script segments</span>
              )}
              {virality !== undefined && (
                <span style={{ fontSize: 12, color: '#f97316' }}>
                  🔥 Virality: {String(virality)}
                </span>
              )}
              <UrgencyDots urgency={idea.urgency} />
            </div>
          )}
        </div>

        {/* ── Quick action buttons (top-right) ─────────────────────── */}
        {!editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            {isDraft && (
              <button
                onClick={() => updateStatus('ready')}
                disabled={actioning !== null}
                style={{
                  ...btnPrimary,
                  padding: '8px 16px',
                  fontSize: 13,
                  cursor: actioning !== null ? 'not-allowed' : 'pointer',
                  opacity: actioning !== null ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {actioning === 'approve' ? 'Approving...' : '✓ Approve'}
              </button>
            )}
            {isReady && (
              <button
                onClick={() => updateStatus('draft')}
                disabled={actioning !== null}
                style={{
                  ...btnSecondary,
                  padding: '7px 12px',
                  fontSize: 12,
                  cursor: actioning !== null ? 'not-allowed' : 'pointer',
                  opacity: actioning !== null ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {actioning === 'revert' ? 'Reverting...' : 'Revert to draft'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Toggle / Edit / Save bar ───────────────────────────────── */}
      {segments.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid ${C.navyBorder}`,
          flexWrap: 'wrap',
        }}>
          {!editing && (
            <>
              <button
                onClick={() => setExpanded(e => !e)}
                style={btnGhost}
              >
                {expanded ? '▴ Hide script' : `▾ Show script (${segments.length} segments)`}
              </button>
              {(isDraft || isReady) && expanded && (
                <button
                  onClick={() => setEditing(true)}
                  style={btnGhost}
                >
                  ✎ Edit script
                </button>
              )}
            </>
          )}
          {editing && (
            <>
              <span style={{ fontSize: 12, color: C.gold, fontWeight: 600, alignSelf: 'center', marginRight: 'auto' }}>
                EDITING — {draftSegments.length} segments
              </span>
              <button onClick={discardEdits} style={btnSecondary} disabled={saving}>
                Cancel
              </button>
              <button
                onClick={() => saveEdits({ approve: false })}
                disabled={saving}
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              {isDraft && (
                <button
                  onClick={() => saveEdits({ approve: true })}
                  disabled={saving}
                  style={{
                    ...btnPrimary,
                    backgroundColor: C.green,
                    color: '#0E1B2C',
                    opacity: saving ? 0.6 : 1,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : '✓ Save & Approve'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {saveError && (
        <div style={{
          marginTop: 10,
          padding: '8px 12px',
          borderRadius: 8,
          backgroundColor: '#3a1a1a',
          color: C.red,
          fontSize: 13,
        }}>
          {saveError}
        </div>
      )}

      {/* ── Expanded segment view (read-only) ──────────────────────── */}
      {expanded && !editing && segments.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {segments.map((s, i) => {
            const img = getSegImage(s)
            const dur = getSegDurationMs(s)
            const tier = imageTier(img)
            return (
              <div key={i} style={{
                backgroundColor: C.navyLight,
                border: `1px solid ${C.navyBorder}`,
                borderRadius: 10,
                padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.slate, letterSpacing: '0.4px' }}>
                    SEGMENT {i + 1}
                  </span>
                  <span style={{ fontSize: 11, color: '#4a6080' }}>{(dur / 1000).toFixed(1)}s</span>
                </div>
                <p dir="auto" style={{ fontSize: 14, color: '#fff', lineHeight: 1.5, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
                  {s.text || <em style={{ color: C.slate }}>(empty)</em>}
                </p>
                <ImageTierChip tier={tier} url={tier.tier === 'url' ? img : null} />
              </div>
            )
          })}
        </div>
      )}

      {/* ── Edit mode segment editor ───────────────────────────────── */}
      {editing && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {draftSegments.map((s, i) => (
            <div key={i} style={{
              backgroundColor: C.navyLight,
              border: `1px solid ${C.navyBorder}`,
              borderRadius: 10,
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.slate, letterSpacing: '0.4px' }}>
                  SEGMENT {i + 1}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => moveSegment(i, -1)} disabled={i === 0} style={iconBtn(i === 0)} title="Move up">↑</button>
                  <button onClick={() => moveSegment(i, 1)} disabled={i === draftSegments.length - 1} style={iconBtn(i === draftSegments.length - 1)} title="Move down">↓</button>
                  <button onClick={() => removeSegment(i)} style={{ ...iconBtn(false), color: C.red }} title="Remove segment">✕</button>
                </div>
              </div>

              <FormField label="NARRATION — what TTS reads (full Egyptian script)" small>
                <textarea
                  value={s.text ?? ''}
                  onChange={e => setSegment(i, { text: e.target.value })}
                  dir="auto"
                  rows={2}
                  style={inputStyle}
                />
              </FormField>

              <FormField label="ON-SCREEN CAPTION — short clickbait (3-7 words, optional emoji)" small>
                <input
                  value={s.caption_ar ?? ''}
                  onChange={e => setSegment(i, { caption_ar: e.target.value })}
                  dir="auto"
                  placeholder={'e.g. «صَلاح بَيع Liverpool 💔»'}
                  style={inputStyle}
                />
              </FormField>

              <FormField label="IMAGE — URL · person:Name · or AI scene prompt" small>
                <input
                  value={s.image_prompt_or_url ?? ''}
                  onChange={e => setSegment(i, { image_prompt_or_url: e.target.value })}
                  placeholder="https://pbs.twimg.com/... | person:Mohamed Salah | English scene prompt"
                  dir="auto"
                  style={inputStyle}
                />
                {s.image_prompt_or_url && (
                  <div style={{ marginTop: 6 }}>
                    <ImageTierChip
                      tier={imageTier(s.image_prompt_or_url)}
                      url={imageTier(s.image_prompt_or_url).tier === 'url' ? s.image_prompt_or_url : null}
                    />
                  </div>
                )}
              </FormField>

              <FormField label="DURATION (ms — 6000-12000 recommended)" small>
                <input
                  type="number"
                  min={1000}
                  max={30000}
                  step={500}
                  value={s.duration_ms ?? 8000}
                  onChange={e => setSegment(i, { duration_ms: Number(e.target.value) })}
                  style={{ ...inputStyle, maxWidth: 160 }}
                />
              </FormField>
            </div>
          ))}

          <button
            onClick={addSegment}
            style={{
              ...btnGhost,
              alignSelf: 'flex-start',
              border: `1px dashed ${C.navyBorder}`,
              padding: '10px 16px',
            }}
          >
            + Add segment
          </button>
        </div>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Bits
// ─────────────────────────────────────────────────────────────────────────────

function ImageTierChip({ tier, url }: { tier: ReturnType<typeof imageTier>; url: string | null }) {
  const color =
    tier.tier === 'url' ? C.green :
    tier.tier === 'person' ? '#60a5fa' :
    tier.tier === 'ai' ? '#a78bfa' :
    C.red
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 11,
      color,
      backgroundColor: `${color}1a`,
      borderRadius: 6,
      padding: '4px 8px',
      maxWidth: '100%',
      overflow: 'hidden',
    }}>
      <span>{tier.icon}</span>
      <span style={{ fontFamily: tier.tier === 'url' ? 'monospace' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {tier.label}
      </span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color, textDecoration: 'underline', marginLeft: 'auto', flexShrink: 0 }}
        >
          open ↗
        </a>
      )}
    </div>
  )
}

function FormField({ label, required, small, children }: { label: string; required?: boolean; small?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: small ? 8 : 0 }}>
      <label style={{
        fontSize: small ? 10 : 12,
        color: C.slate,
        fontWeight: 600,
        display: 'block',
        marginBottom: small ? 4 : 6,
        letterSpacing: '0.3px',
      }}>
        {label} {required && <span style={{ color: C.red }}>*</span>}
      </label>
      {children}
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared inline styles
// ─────────────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${C.navyBorder}`,
  backgroundColor: C.navyLighter,
  color: '#e2e8f0',
  fontSize: 13,
  resize: 'vertical',
  outline: 'none',
  fontFamily: 'inherit',
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  backgroundColor: C.gold,
  color: '#0E1B2C',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const btnSecondary: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 8,
  border: `1px solid ${C.navyBorder}`,
  backgroundColor: 'transparent',
  color: C.slate,
  cursor: 'pointer',
  fontSize: 12,
  whiteSpace: 'nowrap',
}

const btnGhost: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: `1px solid ${C.navyBorder}`,
  backgroundColor: 'transparent',
  color: C.slate,
  cursor: 'pointer',
  fontSize: 12,
}

function iconBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: 6,
    border: `1px solid ${C.navyBorder}`,
    backgroundColor: 'transparent',
    color: disabled ? '#324a6b' : C.slate,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}
