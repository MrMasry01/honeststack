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
}

const Scene: React.FC<SceneProps> = ({
  segment,
  brand,
  voiceUrl,
  durationInFrames,
  segmentStartFrame,
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

  return (
    <AbsoluteFill>
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
             an audio-driven mouth swap. */}
      <Host
        voiceUrl={voiceUrl}
        entranceProgress={entranceProgress}
        audioFrameOffset={segmentStartFrame}
      />

      {/* 3. RTL Arabic caption strip (bottom — stays above the character) */}
      <CaptionStrip
        textAr={segment.text_ar}
        brand={brand}
        entranceProgress={entranceProgress}
      />

      {/* 4. Segment number indicator (top-left) */}
      <SegmentIndicator brand={brand} />
    </AbsoluteFill>
  );
};

// Small translucent segment-number dot in the top-right corner
const SegmentIndicator: React.FC<{ brand: NewsRoundupProps["brand"] }> = ({
  brand,
}) => {
  const frame = useCurrentFrame();
  const pulseScale = 1 + 0.06 * Math.abs(Math.sin((frame / 15) * Math.PI));

  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        right: 40,
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: brand.accent,
        transform: `scale(${pulseScale})`,
        boxShadow: `0 0 12px ${brand.accent}`,
        opacity: 0.85,
      }}
    />
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

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* ── Global voiceover (full duration) ── */}
      {host_voice_url && (
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
