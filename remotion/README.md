# HonestStack World Cup 2026 — Remotion Video Engine

Automated short-form vertical video engine for the HonestStack FIFA World Cup 2026 project. Publishes 4 short-form videos/day in colloquial Egyptian Arabic, featuring a stylised 2D animated Egyptian host.

## Tech Stack

- **Remotion v4** — frame-accurate video rendering in React/TypeScript
- **@remotion/google-fonts/Cairo** — RTL Arabic typeface
- **@remotion/media-utils** — audio amplitude for mouth-sync animation
- **Zod** — runtime props validation with Remotion Studio schema UI

## Setup

```bash
npm install
```

## Preview in Remotion Studio

```bash
npm run dev
```

Opens the Remotion Studio at http://localhost:3000 with live props editor.

## List Registered Compositions

```bash
npm run compositions
# or
npx remotion compositions
```

## Render a Video

```bash
# Using the render.ts CLI
npx tsx render.ts sample-props.json out/worldcup-ep1.mp4

# Or via npm script
npm run render -- sample-props.json out/worldcup-ep1.mp4
```

Output is written to `out/` (created automatically).

## Props Reference

All props are validated against `NewsRoundupSchema` (src/schema.ts).

```ts
{
  host_voice_url: string            // URL or local path to ElevenLabs MP3 narration
  segments: Array<{
    text_ar: string                 // Colloquial Egyptian Arabic caption/narration line
    visual_url: string              // Image URL for this segment's backdrop
    duration_ms: number             // 6000–12000ms recommended
    ken_burns?: {
      from: number                  // Scale at start (e.g. 1.0)
      to: number                    // Scale at end  (e.g. 1.15)
    }
  }>
  brand: {
    primary: string                 // Primary colour hex (e.g. "#0A0A0A")
    accent: string                  // Accent colour hex (e.g. "#D4AF37")
    logo_url: string                // URL or public/ path to logo
  }
  intro_text: string                // Arabic headline for the intro card
  outro_handle: string              // Social handle, e.g. "@HonestStack"
}
```

## Composition Layout

```
[Intro card – 3s]
  [Segment 1: ParallaxBackdrop + Host + CaptionStrip]
  [Segment 2: …]
  [Segment 3: …]
  [Segment N: …]
[Outro card – 3s]
```

Total duration = 3s + Σ segment.duration_ms + 3s (calculated via `calculateMetadata`).

## Component Map

| File | Role |
|------|------|
| `src/Root.tsx` | Registers `NewsRoundup` with `calculateMetadata` |
| `src/NewsRoundup.tsx` | Top-level composition; sequences intro, scenes, outro |
| `src/components/ParallaxBackdrop.tsx` | 3-layer parallax + Ken Burns billboard |
| `src/components/Host.tsx` | SVG 2D host; audio-driven mouth (swap hook for Lottie/Rive) |
| `src/components/CaptionStrip.tsx` | RTL Cairo-font caption strip |
| `src/components/IntroCard.tsx` | Animated intro screen |
| `src/components/OutroCard.tsx` | CTA outro screen |
| `render.ts` | CLI: `npx tsx render.ts <props.json> [output.mp4]` |
| `sample-props.json` | Example 4-segment Egyptian Arabic World Cup episode |

## Swapping in a Lottie/Rive Host

Open `src/components/Host.tsx` and find the comment block:

```ts
// NOTE FOR FUTURE UPGRADE:
//   To swap in a Lottie asset ...
```

Replace `<EgyptianHostSVG>` with your Lottie `<Lottie>` or Rive canvas, passing `mouthState` (0–3) to drive the animation state machine.

## Audio Workflow (ElevenLabs)

1. Generate narration with ElevenLabs → download MP3
2. Place in `public/` or host on CDN
3. Set `host_voice_url` in your props JSON to the `staticFile("narration.mp3")` path or a public URL
4. The mouth animation reads amplitude automatically via `useAudioData`

## Production Notes

- Videos are 1080×1920 (9:16), 30fps, H.264
- Arabic text uses `dir="rtl" lang="ar"` for correct shaping
- Ken Burns effect runs purely via CSS `transform: scale()` interpolation — no canvas dependency
- Images are loaded with Remotion's `<Img>` which pauses rendering until fully loaded (no dropped frames)
