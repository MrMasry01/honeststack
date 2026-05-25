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
             frame) and stays fully visible. */}
      <ParallaxBackdrop
        visualUrl={segment.visual_url}
        durationInFrames={durationInFrames}
        kenBurns={segment.ken_burns}
        brand={brand}
        upperBias
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
      />

      {/* 3. RTL Arabic caption strip (bottom — stays above the character) */}
      <CaptionStrip
        textAr={segment.text_ar}
        brand={brand}
        entranceProgress={entranceProgress}
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
