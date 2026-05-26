import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { NewsRoundupProps } from "./schema";
import { ParallaxBackdrop } from "./components/ParallaxBackdrop";
import { Host } from "./components/Host";
import { CaptionStrip } from "./components/CaptionStrip";
import { IntroCard } from "./components/IntroCard";
import { OutroCard } from "./components/OutroCard";

const INTRO_FRAMES = 90; // 3 s at 30fps
const OUTRO_FRAMES = 90; // 3 s at 30fps

/**
 * Converts a duration in milliseconds to frames at the current fps.
 */
function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared scene-composition contract
// ─────────────────────────────────────────────────────────────────────────────
// These three derived values are computed in <Scene> and forwarded to
// ParallaxBackdrop, the stage-light layer, CaptionStrip, and Host so every
// piece of the frame composes from the same spatial model.
//
//  • sceneDensity   — how tight the source visual is framed. Affects how much
//                     headroom the contained subject needs and how strong the
//                     ambient blur should breathe.
//  • subjectAnchor  — where the photo subject sits. The Pharaoh sits on the
//                     OPPOSITE side ("opposite-side rule") and the stage-light
//                     spotlight is anchored under that same opposite side.
//  • sceneAmbientHex — dominant scene color. Used to tint the bottom-band
//                     gradient and the spotlight so the mascot looks lit by
//                     the actual scene rather than dropped onto a black mask.
// ─────────────────────────────────────────────────────────────────────────────
export type SceneDensity = "close" | "mid" | "wide";
export type SubjectAnchor = "left" | "center" | "right";

/** Heuristic — treat URLs that end in a known video extension as video. */
function isVideoUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url);
}

/**
 * Derive a sceneDensity from segment data without requiring a schema change.
 * Heuristic rules (documented; safe to override once schema carries the field):
 *   - Any video backdrop → 'mid' (motion already does the framing work)
 *   - kenBurns.to >= 1.18 → 'close' (heavy zoom implies the source is tight)
 *   - kenBurns.to <= 1.04 → 'wide'  (no zoom → assume scene is wide/loose)
 *   - otherwise → 'mid'
 */
function deriveSceneDensity(
  segment: NewsRoundupProps["segments"][number],
): SceneDensity {
  if (isVideoUrl(segment.visual_url)) return "mid";
  const zoomTo = segment.ken_burns?.to;
  if (typeof zoomTo === "number") {
    if (zoomTo >= 1.18) return "close";
    if (zoomTo <= 1.04) return "wide";
  }
  return "mid";
}

/**
 * Validate a hex color string. We refuse anything that isn't a clean #RRGGBB
 * because we splice it directly into CSS gradient stops with an alpha suffix
 * (`#RRGGBB${alphaHex}`) — a malformed value would silently break the wash.
 */
function isValidHex(hex: string | undefined): hex is string {
  return Boolean(hex && /^#[0-9a-fA-F]{6}$/.test(hex));
}

/**
 * Append a two-char alpha byte to a 6-char hex (e.g. '#D4AF37' + 0.78 → '#D4AF37C7').
 */
function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const byte = Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `${hex}${byte}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// StageLight: a soft radial wash anchored under the Pharaoh's position.
// Tinted with sceneAmbientHex blended toward brand.accent — sells the idea
// that the mascot is standing in light spilled from the scene above.
// ─────────────────────────────────────────────────────────────────────────────
const StageLight: React.FC<{
  brand: NewsRoundupProps["brand"];
  ambientHex: string;
  /** Where Pharaoh is positioned (opposite of subjectAnchor by default). */
  pharaohSide: SubjectAnchor;
}> = ({ brand, ambientHex, pharaohSide }) => {
  // X anchor of the spotlight, as % of frame width.
  const cx =
    pharaohSide === "left" ? 28 : pharaohSide === "right" ? 72 : 50;
  // Y anchor — Pharaoh stands roughly in the lower-mid band.
  const cy = 80;

  // Blend ambient toward accent for a slightly warmer pool of light.
  const tintHex = isValidHex(ambientHex) ? ambientHex : brand.accent;
  const inner = hexWithAlpha(tintHex, 0.32);
  const mid = hexWithAlpha(tintHex, 0.14);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        // Two radial stops: a tight tinted core that hugs the avatar, and a
        // wider soft halo that fades to transparent before reaching the
        // photo subject above. Keeps the effect localised.
        background: [
          `radial-gradient(circle at ${cx}% ${cy}%, ${inner} 0%, ${mid} 18%, transparent 38%)`,
          `radial-gradient(circle at ${cx}% ${cy}%, ${hexWithAlpha(brand.accent, 0.10)} 0%, transparent 22%)`,
        ].join(", "),
        // mix-blend-mode: screen would over-blow on bright photos; normal
        // composite at modest alpha looks closer to real bounce light.
        mixBlendMode: "normal",
      }}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Scene: a single news segment
// ─────────────────────────────────────────────────────────────────────────────
interface SceneProps {
  segment: NewsRoundupProps["segments"][number];
  brand: NewsRoundupProps["brand"];
  voiceUrl: string;
  durationInFrames: number;
  /** Absolute frame (in the full composition) at which this scene starts. */
  segmentStartFrame: number;
  /** Days remaining until WC2026 kickoff. Drives the countdown chip. */
  daysToWc?: number;
  /** 1-indexed segment position (for the dot stack). */
  segmentIndex: number;
  /** Total number of segments (for the dot stack). */
  segmentCount: number;
}

const Scene: React.FC<SceneProps> = ({
  segment,
  brand,
  voiceUrl,
  durationInFrames,
  segmentStartFrame,
  daysToWc,
  segmentIndex,
  segmentCount,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Host entrance spring (first 20 frames of each scene)
  const entranceProgress = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 120 },
    durationInFrames: 20,
  });

  // Per-segment audio (new architecture) takes precedence over the global
  // voiceUrl (legacy mode). When segment.audio_url is set, this scene plays
  // ONLY its own MP3 — visual duration_ms is set to the actual MP3 length
  // upstream, so audio + visual stay perfectly in sync per scene.
  const sceneAudioUrl = segment.audio_url || voiceUrl;
  const hasPerSegmentAudio = Boolean(segment.audio_url);

  // ── Shared scene-composition contract ────────────────────────────────────
  // For v1 these are derived from existing schema fields. Once schema carries
  // explicit density / subject_anchor / ambient_hex on the segment, switch to
  // `segment.subject_anchor ?? 'center'` etc. — the rest of the pipeline below
  // is already wired to consume the explicit values.
  const sceneDensity: SceneDensity = deriveSceneDensity(segment);

  // No schema field yet → default centered. Documented in integration notes.
  const subjectAnchor: SubjectAnchor =
    (segment as unknown as { subject_anchor?: SubjectAnchor }).subject_anchor ??
    "center";

  // Placeholder dominant color. Ideally a Gemini I2I or vision pass extracts
  // the dominant hex from segment.visual_url upstream; until then fall back
  // to brand.primary so the gradient still feels on-brand.
  const sceneAmbientHex: string = isValidHex(
    (segment as unknown as { ambient_hex?: string }).ambient_hex,
  )
    ? ((segment as unknown as { ambient_hex: string }).ambient_hex)
    : isValidHex(brand.primary)
      ? brand.primary
      : "#0A0A0A";

  // Pharaoh sits on the OPPOSITE side from the photo subject (opposite-side
  // rule). When subject is centered, Pharaoh defaults to right (matches the
  // current Host implementation's resting pose).
  const pharaohSide: SubjectAnchor =
    subjectAnchor === "left"
      ? "right"
      : subjectAnchor === "right"
        ? "left"
        : "right";

  return (
    <AbsoluteFill>
      {/* 0. Per-segment narration audio. When the upstream pipeline split
             TTS per segment, each scene gets its own MP3 — Sequence cuts it
             off at scene end automatically. */}
      {hasPerSegmentAudio && (
        <Audio src={sceneAudioUrl} volume={1} />
      )}

      {/* 1. Parallax backdrop — the event visual. The fixed Pharaoh mascot is
             small and lives in a bottom band, so the event visual is always
             biased to the UPPER portion (it occupies the upper ~75% of the
             frame) and stays fully visible. The bottom vignette is now a
             tinted ambient wash (NOT a black letterbox), so the mascot band
             reads as the same scene rather than a separate overlay. */}
      <ParallaxBackdrop
        visualUrl={segment.visual_url}
        durationInFrames={durationInFrames}
        kenBurns={segment.ken_burns}
        brand={brand}
        upperBias
        subjectAnchor={subjectAnchor}
        sceneAmbientHex={sceneAmbientHex}
        sceneDensity={sceneDensity}
      />

      {/* 1b. Stage-light wash — a soft radial pool of tinted light anchored
              under the Pharaoh's standing position. Layered BETWEEN backdrop
              and Host so the mascot reads as "lit by the scene" rather than
              floating on a black bar. Tinted with sceneAmbientHex. */}
      <StageLight
        brand={brand}
        ambientHex={sceneAmbientHex}
        pharaohSide={pharaohSide}
      />

      {/* 2. Host — the fixed Egyptian Pharaoh mascot. Small, glides
             horizontally along the lower band above the caption strip, with
             an audio-driven mouth swap. Audio offset is 0 when audio is
             per-segment (Host samples from the start of its OWN MP3), or
             the absolute segment start frame when in legacy global-audio
             mode (Host samples from the matching slice of the full MP3). */}
      <Host
        voiceUrl={sceneAudioUrl}
        entranceProgress={entranceProgress}
        audioFrameOffset={hasPerSegmentAudio ? 0 : segmentStartFrame}
        pharaohPose={segment.pharaoh_pose}
        sceneDurationFrames={durationInFrames}
        // Shared scene-composition contract — the avatar agent reads these
        // to pick the Pharaoh's horizontal anchor (opposite-side rule) and
        // optionally tint its shadow / accent to match scene ambient.
        sceneDensity={sceneDensity}
        subjectAnchor={subjectAnchor}
        sceneAmbientHex={sceneAmbientHex}
      />

      {/* 3. RTL Arabic caption strip (bottom — stays above the character).
             Lower-third lozenge, NOT a full-width opaque band: anchored on
             the same side as the photo subject so it doesn't crowd Pharaoh. */}
      <CaptionStrip
        textAr={segment.text_ar}
        brand={brand}
        entranceProgress={entranceProgress}
        subjectAnchor={subjectAnchor}
        sceneAmbientHex={sceneAmbientHex}
      />

      {/* 4. Countdown chip (top-right) — replaces the lone pulse dot.
             When the WC has started (daysToWc === 0 or undefined), falls
             back to a small accent dot so we don't show "0 days" oddly. */}
      <CountdownChip brand={brand} daysToWc={daysToWc} />

      {/* 5. Segment position dots (top-right, below countdown) — a small
             progress indicator so viewers feel the roundup advancing. */}
      <SegmentDots
        brand={brand}
        index={segmentIndex}
        total={segmentCount}
      />
    </AbsoluteFill>
  );
};

// Countdown chip — "١٧ يوم على المونديال". Top-right corner. Hides when
// the tournament has started.
const CountdownChip: React.FC<{
  brand: NewsRoundupProps["brand"];
  daysToWc?: number;
}> = ({ brand, daysToWc }) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(frame / 15, 0.95);

  if (!daysToWc || daysToWc <= 0) {
    // Tournament has started — show "LIVE" marker instead
    return (
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 40,
          opacity,
          background: "rgba(0,0,0,0.55)",
          border: `1.5px solid ${brand.accent}`,
          borderRadius: 999,
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          backdropFilter: "blur(6px)",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#FF3B30",
            boxShadow: "0 0 8px #FF3B30",
          }}
        />
        <span
          style={{
            fontFamily: "Cairo, sans-serif",
            fontWeight: 800,
            fontSize: 20,
            color: "#FFFFFF",
            letterSpacing: 1.2,
          }}
        >
          LIVE
        </span>
      </div>
    );
  }

  // Convert digits to Arabic numerals for visual cohesion with the script
  const toArabicDigits = (n: number) =>
    String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        right: 40,
        opacity,
        background: "rgba(0,0,0,0.55)",
        border: `1.5px solid ${brand.accent}`,
        borderRadius: 999,
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        backdropFilter: "blur(6px)",
        boxShadow: `0 0 16px rgba(0,0,0,0.5)`,
      }}
    >
      <span
        style={{
          fontFamily: "Cairo, sans-serif",
          fontWeight: 900,
          fontSize: 26,
          color: brand.accent,
          lineHeight: 1,
        }}
      >
        {toArabicDigits(daysToWc)}
      </span>
      <span
        style={{
          fontFamily: "Cairo, sans-serif",
          fontWeight: 700,
          fontSize: 16,
          color: "#FFFFFF",
          lineHeight: 1,
          direction: "rtl",
        }}
      >
        يوم على المونديال
      </span>
    </div>
  );
};

// A tiny dot stack under the countdown showing segment position.
// e.g. ●●○○○○○ for segment 2 of 7.
const SegmentDots: React.FC<{
  brand: NewsRoundupProps["brand"];
  index: number; // 1-indexed
  total: number;
}> = ({ brand, index, total }) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(frame / 20, 0.7);

  return (
    <div
      style={{
        position: "absolute",
        top: 112,
        right: 40,
        opacity,
        display: "flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const active = i < index;
        return (
          <div
            key={i}
            style={{
              width: active ? 8 : 6,
              height: active ? 8 : 6,
              borderRadius: "50%",
              background: active ? brand.accent : "rgba(255,255,255,0.45)",
              boxShadow: active ? `0 0 6px ${brand.accent}` : "none",
              transition: "all 200ms",
            }}
          />
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NewsRoundup: top-level composition
// ─────────────────────────────────────────────────────────────────────────────
export const NewsRoundup: React.FC<NewsRoundupProps> = ({
  host_voice_url,
  segments,
  brand,
  intro_text,
  outro_handle,
  days_to_wc,
}) => {
  const { fps } = useVideoConfig();

  // Build cumulative offset table for each segment
  const segmentOffsets: number[] = [];
  let cursor = INTRO_FRAMES;
  for (const seg of segments) {
    segmentOffsets.push(cursor);
    cursor += msToFrames(seg.duration_ms, fps);
  }
  const outroStart = cursor;

  // Per-segment audio is the new architecture (one MP3 per segment,
  // perfect audio↔visual sync). Legacy mode uses one big host_voice_url
  // played globally with the proportional duration-scaling hack. Detect
  // which mode this composition is in from the first segment.
  const usingPerSegmentAudio = segments.some((s) => Boolean(s.audio_url));

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* ── Global voiceover (legacy mode only) ──
          When any segment provides its own audio_url, audio is played
          per-segment inside each Scene — no global track. */}
      {!usingPerSegmentAudio && host_voice_url && (
        <Audio src={host_voice_url} volume={1} />
      )}

      {/* ── Intro card ── */}
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroCard
          introText={intro_text}
          brand={brand}
          durationInFrames={INTRO_FRAMES}
        />
      </Sequence>

      {/* ── Segment scenes ── */}
      {segments.map((segment, i) => {
        const from = segmentOffsets[i];
        const durationInFrames = msToFrames(segment.duration_ms, fps);
        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <Scene
              segment={segment}
              brand={brand}
              voiceUrl={host_voice_url}
              durationInFrames={durationInFrames}
              segmentStartFrame={from}
              daysToWc={days_to_wc}
              segmentIndex={i + 1}
              segmentCount={segments.length}
            />
          </Sequence>
        );
      })}

      {/* ── Outro card ── */}
      <Sequence from={outroStart} durationInFrames={OUTRO_FRAMES}>
        <OutroCard
          outroHandle={outro_handle}
          brand={brand}
          durationInFrames={OUTRO_FRAMES}
        />
      </Sequence>

      {/* ── Brand logo watermark (all segments, not intro/outro) ── */}
      <Sequence
        from={INTRO_FRAMES}
        durationInFrames={outroStart - INTRO_FRAMES}
      >
        <BrandWatermark brand={brand} />
      </Sequence>
    </AbsoluteFill>
  );
};

// Small brand watermark in top-left during segments
const BrandWatermark: React.FC<{ brand: NewsRoundupProps["brand"] }> = ({
  brand,
}) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(frame / 20, 0.7);

  return (
    <div
      style={{
        position: "absolute",
        top: 48,
        left: 40,
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      {/* Accent dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: brand.accent,
          boxShadow: `0 0 8px ${brand.accent}`,
        }}
      />
      <span
        style={{
          fontFamily: "Cairo, sans-serif",
          fontWeight: 700,
          fontSize: 22,
          color: "#FFFFFF",
          letterSpacing: 1,
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
        }}
      >
        HonestStack
      </span>
    </div>
  );
};
