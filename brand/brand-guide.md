# HonestStack — Brand Guide

*Locked 2026-05-21. The identity for the videos, the socials, and the cockpit.*

## Essence

**The World Cup — with no BS and a big laugh.** Verified football news delivered like
your funniest, sharpest friend reacting in real time. Egyptian, fast, loud, honest.

Personality: a young Egyptian football creator (Marwan Serry / Mogzz / Nso7y energy) —
quick, witty, a little savage, always one beat ahead of the viewer.

## Logo

**Primary mark:** `brand/honeststack-logo.png` — a pop-art comic emblem: a chunky stacked
block motif with a comic-burst of lightning + exclamation, halftone texture, bold black
outlines, and the `HonestStack` wordmark. Loud, funny, broadcast-bold.

- Live (public): `https://lhqcfghqdoootrkyybbx.supabase.co/storage/v1/object/public/assets/brand/honeststack-logo.png`
- Use on: channel art, intro/outro cards, watermark, light or dark backgrounds.
- Don't: stretch, recolour, or drop the black outline.

## Mascot — "The Pharaoh"

`brand/honeststack-mascot.png` — a winking pharaoh in a red football kit holding a soccer
ball. The brand's face — distinct from the per-video avatar (which resembles each video's
subject). The Pharaoh is the *fixed* brand character.

- Live (public): `.../assets/brand/honeststack-mascot.png`
- Use on: profile pictures, thumbnails, outro card, stickers, channel branding.

## Colour palette

| Name | Hex | Role |
|---|---|---|
| Masry Red | `#E63329` | Primary — energy, urgency, "breaking", Egypt |
| Pharaoh Gold | `#F4B61A` | Accent — pop, warmth, highlights, CTAs |
| Ink | `#161311` | Text, outlines, dark backgrounds |
| Sand | `#FBF3E4` | Light backgrounds, breathing room |

High-contrast and punchy by design — it has to pop in a crowded social feed. Red leads,
gold accents, ink and sand carry everything else.

## Typography

| Font | Role |
|---|---|
| **Anton** | Latin display — headlines, big on-screen text, English UI |
| **Lalezar** | Arabic display — hooks, punchy on-screen captions, headline text |
| **Cairo** | Arabic body — smaller captions, longer text, the cockpit UI |

All three are free (Google Fonts). Lalezar carries the comic/playful Egyptian energy;
Cairo keeps dense text legible.

## Voice

The spoken/script voice is defined in `honeststack-editor/references/tone-guide.md` —
react-don't-report, one continuous riff, sharp wit, colloquial Egyptian. The visual brand
matches it: bold, fast, funny, never corporate.

## Where it's applied

- **`brand_settings` (DB)** — `primary_color`, `accent_color`, `font_family`, `logo_url`,
  `voice_style` all set. The Remotion renderer reads these at render time, so video colours
  update automatically.
- **Renderer** — colours auto-apply via brand_settings; the Anton/Lalezar fonts and
  intro/outro polish are a code update (pending).
- **Cockpit dashboard** — recolour from the placeholder navy to this palette (pending).
