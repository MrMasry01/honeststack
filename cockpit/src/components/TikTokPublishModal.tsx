import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// TikTokPublishModal — the COMPLIANT "Publish to TikTok" screen.
//
// Built to TikTok's Content Sharing Guidelines so the integration can pass the
// Direct Post audit. It MUST let the creator, before anything is posted:
//   • see which account it posts to,
//   • edit the caption,
//   • choose a privacy level from the account's ALLOWED options (creator_info),
//   • toggle Comment / Duet / Stitch (disabled where the account disables them),
//   • disclose commercial content (Your brand / Branded content) with the right
//     rules (branded content can't be private),
//   • read the Music Usage Confirmation (and Branded Content) consent text.
// The user then explicitly taps Post. Nothing posts automatically.
//
// Settings flow to the publish-tiktok edge fn as { direct:true, post_info:{…} }.
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  navy: '#0E1B2C',
  navyLight: '#162438',
  navyLighter: '#1E3050',
  border: '#243a55',
  gold: '#F4C20D',
  slate: '#94a3b8',
  white: '#fff',
  red: '#ef4444',
  green: '#10b981',
  teal: '#2dd4bf',
}

const MUSIC_USAGE_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en'
const BRANDED_POLICY_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en'

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends (mutual follow)',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me (private)',
}

const CAPTION_CAP = 2000

type CreatorInfo = {
  privacy_level_options: string[]
  comment_disabled: boolean
  duet_disabled: boolean
  stitch_disabled: boolean
  creator_username: string | null
  creator_nickname: string | null
}

interface Props {
  assetId: string
  videoUrl: string | null
  defaultCaption: string
  onClose: () => void
  onPublished: () => void
}

export default function TikTokPublishModal({ assetId, videoUrl, defaultCaption, onClose, onPublished }: Props) {
  const [info, setInfo] = useState<CreatorInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [caption, setCaption] = useState(defaultCaption.slice(0, CAPTION_CAP))
  const [privacy, setPrivacy] = useState<string>('')
  const [allowComment, setAllowComment] = useState(true)
  const [allowDuet, setAllowDuet] = useState(true)
  const [allowStitch, setAllowStitch] = useState(true)

  const [disclose, setDisclose] = useState(false)
  const [yourBrand, setYourBrand] = useState(false)
  const [brandedContent, setBrandedContent] = useState(false)

  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [posted, setPosted] = useState(false)

  // Fetch the creator's allowed options (read-only — posts nothing).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.functions.invoke('publish-tiktok', {
        body: { check: 'creator_info' },
      })
      if (cancelled) return
      if (error) { setLoadError(error.message); return }
      const d = data as ({ ok?: boolean; error?: string } & CreatorInfo)
      if (d?.ok === false) { setLoadError(d.error || 'Could not load TikTok account info'); return }
      setInfo(d)
      // Default privacy to the MOST PRIVATE allowed option (never auto-public).
      const opts = d.privacy_level_options || []
      setPrivacy(opts.includes('SELF_ONLY') ? 'SELF_ONLY' : (opts[0] ?? ''))
      // Respect account-level interaction settings.
      if (d.comment_disabled) setAllowComment(false)
      if (d.duet_disabled) setAllowDuet(false)
      if (d.stitch_disabled) setAllowStitch(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Branded content can't be posted privately — TikTok rejects it.
  const brandedPrivateConflict = brandedContent && privacy === 'SELF_ONLY'
  const discloseInvalid = disclose && !yourBrand && !brandedContent
  const canPost = !!info && !posting && !posted &&
    caption.trim().length > 0 && !!privacy &&
    !brandedPrivateConflict && !discloseInvalid

  async function handlePost() {
    if (!canPost) return
    setPosting(true)
    setPostError(null)
    const { data, error } = await supabase.functions.invoke('publish-tiktok', {
      body: {
        asset_id: assetId,
        direct: true,
        post_info: {
          title: caption.trim(),
          privacy_level: privacy,
          disable_comment: !allowComment,
          disable_duet: !allowDuet,
          disable_stitch: !allowStitch,
          brand_content_toggle: disclose && brandedContent,
          brand_organic_toggle: disclose && yourBrand,
        },
      },
    })
    setPosting(false)
    if (error) { setPostError(error.message); return }
    const d = data as { ok?: boolean; error?: string } | null
    if (d?.ok === false) { setPostError(d.error || 'TikTok rejected the post'); return }
    setPosted(true)
    onPublished()
    setTimeout(onClose, 1600)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 760, backgroundColor: C.navy,
          border: `1px solid ${C.border}`, borderRadius: 14,
          display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 6, backgroundColor: '#000',
              color: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800,
            }}>TT</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.white }}>Post to TikTok</span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: C.slate, fontSize: 22,
            cursor: 'pointer', lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* Video preview */}
          <div style={{ width: 200, flexShrink: 0 }}>
            <div style={{ aspectRatio: '9/16', backgroundColor: C.navyLighter, borderRadius: 10, overflow: 'hidden' }}>
              {videoUrl
                ? <video src={videoUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: C.border }}>🎬</div>}
            </div>
            {info && (
              <div style={{ marginTop: 10, fontSize: 12, color: C.slate, textAlign: 'center' }}>
                Posting to <span style={{ color: C.white, fontWeight: 600 }}>@{info.creator_username || 'your account'}</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {loadError ? (
              <div style={{ color: C.red, fontSize: 13, backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 8 }}>
                Couldn't load your TikTok account: {loadError}
              </div>
            ) : !info ? (
              <div style={{ color: C.slate, fontSize: 13 }}>Loading your TikTok settings…</div>
            ) : (
              <>
                {/* Caption */}
                <Field label="Caption">
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_CAP))}
                    dir="auto"
                    rows={4}
                    style={{
                      width: '100%', resize: 'vertical', boxSizing: 'border-box',
                      backgroundColor: C.navyLight, border: `1px solid ${C.border}`,
                      borderRadius: 8, color: C.white, fontSize: 13, padding: 10, lineHeight: 1.5,
                    }}
                  />
                  <div style={{ fontSize: 11, color: C.slate, textAlign: 'right' }}>{caption.length}/{CAPTION_CAP}</div>
                </Field>

                {/* Privacy */}
                <Field label="Who can see this video">
                  <select
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value)}
                    style={{
                      width: '100%', backgroundColor: C.navyLight, border: `1px solid ${C.border}`,
                      borderRadius: 8, color: C.white, fontSize: 13, padding: '9px 10px',
                    }}
                  >
                    <option value="" disabled>Select who can view…</option>
                    {info.privacy_level_options.map((o) => (
                      <option key={o} value={o}>{PRIVACY_LABELS[o] || o}</option>
                    ))}
                  </select>
                  {brandedPrivateConflict && (
                    <div style={{ fontSize: 11, color: C.red }}>
                      Branded content can't be private — choose a more public option.
                    </div>
                  )}
                </Field>

                {/* Interaction toggles */}
                <Field label="Allow users to">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Toggle label="Comment" checked={allowComment} disabled={info.comment_disabled}
                      onChange={setAllowComment} disabledHint="Disabled in your TikTok account settings" />
                    <Toggle label="Duet" checked={allowDuet} disabled={info.duet_disabled}
                      onChange={setAllowDuet} disabledHint="Disabled in your TikTok account settings" />
                    <Toggle label="Stitch" checked={allowStitch} disabled={info.stitch_disabled}
                      onChange={setAllowStitch} disabledHint="Disabled in your TikTok account settings" />
                  </div>
                </Field>

                {/* Commercial disclosure */}
                <Field label="Disclose video content">
                  <Toggle
                    label="Turn on to disclose that this video promotes goods or services"
                    checked={disclose}
                    onChange={(v) => { setDisclose(v); if (!v) { setYourBrand(false); setBrandedContent(false) } }}
                  />
                  {disclose && (
                    <div style={{
                      marginTop: 8, padding: 12, borderRadius: 8,
                      backgroundColor: C.navyLight, border: `1px solid ${C.border}`,
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      <CheckRow label="Your brand"
                        sub="You are promoting yourself or your own business."
                        checked={yourBrand} onChange={setYourBrand} />
                      <CheckRow label="Branded content"
                        sub="You are promoting another brand or a third party (paid partnership)."
                        checked={brandedContent} onChange={setBrandedContent} />
                      {discloseInvalid && (
                        <div style={{ fontSize: 11, color: C.red }}>Select at least one to disclose.</div>
                      )}
                      {(yourBrand || brandedContent) && (
                        <div style={{ fontSize: 11, color: C.slate }}>
                          Your video will be labelled “{brandedContent ? 'Paid partnership' : 'Promotional content'}”.
                        </div>
                      )}
                    </div>
                  )}
                </Field>

                {/* Compliance / consent text */}
                <div style={{ fontSize: 11, color: C.slate, lineHeight: 1.6 }}>
                  By posting, you agree to TikTok's{' '}
                  {disclose && brandedContent && (
                    <>
                      <a href={BRANDED_POLICY_URL} target="_blank" rel="noopener noreferrer" style={{ color: C.gold }}>Branded Content Policy</a>
                      {' and '}
                    </>
                  )}
                  <a href={MUSIC_USAGE_URL} target="_blank" rel="noopener noreferrer" style={{ color: C.gold }}>Music Usage Confirmation</a>.
                </div>

                {postError && (
                  <div style={{ color: C.red, fontSize: 12, backgroundColor: 'rgba(239,68,68,0.1)', padding: 10, borderRadius: 8, wordBreak: 'break-word' }}>
                    {postError}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 20px', borderTop: `1px solid ${C.border}`,
        }}>
          <button onClick={onClose} style={{
            padding: '9px 16px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: 'none', color: C.slate, fontSize: 13, cursor: 'pointer',
          }}>Cancel</button>
          <button
            onClick={handlePost}
            disabled={!canPost}
            style={{
              padding: '9px 20px', borderRadius: 8, border: 'none',
              backgroundColor: posted ? C.green : C.gold,
              color: '#0E1B2C', fontSize: 13, fontWeight: 700,
              cursor: canPost ? 'pointer' : 'not-allowed', opacity: canPost || posted ? 1 : 0.5,
            }}
          >
            {posted ? '✓ Sent to TikTok' : posting ? 'Posting…' : 'Post to TikTok'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.slate, letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, checked, disabled, onChange, disabledHint }: {
  label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; disabledHint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      title={disabled ? disabledHint : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', padding: 0, textAlign: 'left', opacity: disabled ? 0.45 : 1,
      }}
    >
      <span style={{
        width: 38, height: 22, borderRadius: 11, flexShrink: 0, position: 'relative',
        backgroundColor: checked ? C.teal : C.border, transition: 'background-color 0.15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2, width: 18, height: 18,
          borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.15s',
        }} />
      </span>
      <span style={{ fontSize: 13, color: C.white }}>{label}</span>
    </button>
  )
}

function CheckRow({ label, sub, checked, onChange }: {
  label: string; sub: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3, accentColor: C.teal, width: 15, height: 15 }} />
      <span>
        <div style={{ fontSize: 13, color: C.white, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: C.slate }}>{sub}</div>
      </span>
    </label>
  )
}
