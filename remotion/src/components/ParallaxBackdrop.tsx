import React from "react";
import {
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Img,
  OffthreadVideo,
} from "remotion";
import type { KenBurns, Brand } from "../schema";

/** Heuristic — treat URLs that end in a known video extension as video. */
function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url);
}

/** Validate #RRGGBB hex (kept local — same shape as the helper in NewsRoundup). */
function isValidHex(hex: string | undefined): hex is string {
  return Boolean(hex && /^#[0-9a-fA-F]{6}$/.test(hex));
}

/** Append a two-char alpha byte to a 6-char hex string. */
function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const byte = Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `${hex}${byte}`;
}

type SceneDensity = "close" | "mid" | "wide";
type SubjectAnchor = "left" | "center" | "right";

interface ParallaxBackdropProps {
  visualUrl: string;
  durationInFrames: number;
  kenBurns?: KenBurns;
  brand: Brand;
  /** 0–1 progress through this segment */
  progress?: number;
  /**
   * When true, the lower portion of the frame is reserved for the host
   * mascot — the focal image is biased upward and the bottom darkens
   * more aggressively so the mascot composites cleanly.
   */
  upperBias?: boolean;
  /**
   * Where the photo subject sits horizontally. Drives an anchor-aware
   * counter-offset on the contained subject layer so the Pharaoh (which
   * sits on the OPPOSITE side per the opposite-side rule) doesn't collide
   * with the photo's visual weight.
   */
  subjectAnchor?: SubjectAnchor;
  /**
   * Dominant scene color (#RRGGBB). Used to tint the bottom-band ambient
   * wash so the mascot reads as lit by the scene rather than dropped onto
   * a black letterbox. Falls back to brand.primary when invalid/missing.
   */
  sceneAmbientHex?: string;
  /**
   * How tight the source is framed. Affects how much vertical headroom
   * the contained-subject layer takes — close shots get a touch more
   * room, wide shots get a touch less so the ambient wash can breathe.
   */
  sceneDensity?: SceneDensity;
}

/**
 * Four-layer backdrop optimised to KEEP THE SUBJECT WHOLE.
 *
 * The old version used objectFit:cover with a 120% overflow + Ken Burns
 * zoom, which cropped landscape sports photos hard on both sides — players
 * lost their bodies, faces went off-frame. Sports source photos are almost
 * always 16:9 landscape; forcing them into a 9:16 cover crop is destructive.
 *
 * New layout (Apple Music / TikTok "now playing" style):
 *
 * Layer 0 (bottom): brand-gradient fill, always visible fallback.
 *
 * Layer 1 (BLURRED AMBIENT): the SAME image stretched to cover the 9:16
 * frame, heavily blurred and darkened. This fills the frame with on-brand
 * ambient colour drawn from the actual photo. Ken Burns scale + parallax
 * pan are applied HERE — the blurred backdrop does the motion.
 *
 * Layer 2 (CONTAINED SUBJECT): the actual photo with objectFit:contain.
 * The whole subject is preserved. Slight upward bias when a host mascot
 * occupies the bottom band. Anchor-aware horizontal counter-offset shifts
 * the subject OPPOSITE the Pharaoh side so the two visual weights balance.
 *
 * Layer 3 (ambient wash + caption-band shade): NOT a black vignette. The
 * bottom band is tinted with sceneAmbientHex at falling alphas so it reads
 * as ambient light spilling out of the scene, not a letterbox bar. A faint
 * darker pad sits at the very bottom edge to preserve caption contrast
 * without re-introducing the black-band feel.
 *
 * For VIDEO backdrops the blurred-ambient layer is omitted (compositor
 * cost is high for double-decoding a video, and motion is already there);
 * we keep the video at objectFit:cover with the lighter parallax pan.
 */
export const ParallaxBackdrop: React.FC<ParallaxBackdropProps> = ({
  visualUrl,
  durationInFrames,
  kenBurns = { from: 1.0, to: 1.08 },
  brand,
  upperBias = false,
  subjectAnchor = "center",
  sceneAmbientHex,
  sceneDensity = "mid",
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const progress = Math.min(frame / Math.max(durationInFrames - 1, 1), 1);

  // Ken Burns scale — applied to the blurred ambient backdrop, not the
  // subject. The subject stays still and crisp; the ambient breathes.
  const ambientScale = interpolate(
    progress,
    [0, 1],
    [kenBurns.from, kenBurns.to],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Subtle parallax — ambient drifts more than the subject layer.
  const ambientOffsetX = interpolate(progress, [0, 1], [-24, 24], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subject parallax: time-based drift (existing behaviour, unchanged amount).
  const subjectParallaxX = interpolate(progress, [0, 1], [-6, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Anchor-aware counter-offset ────────────────────────────────────────
  // When the Pharaoh sits on one side of the frame, the photo subject in
  // Layer 2 shifts the OPPOSITE direction by ~7% of frame width so the
  // two visual weights balance instead of collide. Centered subjects get
  // a 0px nudge.
  //   subjectAnchor === 'left'  → Pharaoh on right → subject nudges left
  //   subjectAnchor === 'right' → Pharaoh on left  → subject nudges right
  // This is ADDED to subjectParallaxX so time-parallax still works.
  const anchorShiftPct = 0.07;
  const subjectAnchorX =
    subjectAnchor === "left"
      ? -Math.round(width * anchorShiftPct)
      : subjectAnchor === "right"
        ? Math.round(width * anchorShiftPct)
        : 0;
  const subjectOffsetX = subjectAnchorX + subjectParallaxX;

  const vignetteOffsetX = interpolate(progress, [0, 1], [-4, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subject layout: contain it within the upper region when a mascot
  // occupies the bottom band, otherwise contain it across the full frame.
  //
  // sceneDensity drives BOTH the band height AND the fit mode:
  //   • close  — faces fill the frame; give the subject more vertical room
  //              (0.78) so chins aren't clipped. Fit=contain (keep full face).
  //   • mid    — standard mix (0.74). Fit=contain.
  //   • wide   — environmental shots (training pitch, stadium, group photos).
  //              These are usually landscape source images that, when
  //              contained inside a 9:16 frame, leave huge top/bottom voids
  //              (the "black hole" bug from the Newcastle frame). Solution:
  //              expand the band to nearly full height (0.88) AND switch
  //              to objectFit:cover so the photo fills the area, accepting
  //              a small horizontal crop. Wide shots have content to spare.
  // Trimmed (May 2026) from {close:0.78, mid:0.74, wide:0.88} to give the
  // Pharaoh more vertical room — Host's CHAR_HEIGHT bumped from 0.22→0.26
  // baseline in the same commit, and the two need to add to ~1.0 (slight
  // overlap on the opposite-side edge is fine). Wide stays largest since
  // those scenes use cover mode and the Pharaoh anchor is side, not center.
  const densityHeightFactor =
    sceneDensity === "close" ? 0.68 :
    sceneDensity === "wide"  ? 0.82 :
                               0.70;
  const subjectFitMode: "contain" | "cover" =
    sceneDensity === "wide" ? "cover" : "contain";
  const subjectMaxHeight = upperBias
    ? Math.round(height * densityHeightFactor)
    : height;
  const subjectTop = upperBias ? Math.round(height * 0.02) : 0;

  const isVideo = isVideoUrl(visualUrl);

  // ── Resolve ambient tint for the bottom-band wash ──────────────────────
  // Default to brand.primary when sceneAmbientHex is missing/invalid. The
  // alpha-byte append below requires a clean #RRGGBB string.
  const ambientHex: string = isValidHex(sceneAmbientHex)
    ? sceneAmbientHex
    : isValidHex(brand.primary)
      ? brand.primary
      : "#0A0A0A";

  // Build the ambient wash. NOT a hard black bar — a multi-stop tinted
  // gradient that pulls the dominant scene color down into the mascot
  // band so it feels like spill light, not a letterbox.
  //
  // Stack of three gradients composited together (order: top → bottom):
  //   • Soft top scrim — preserves SegmentDots / Countdown legibility.
  //   • Tinted ambient wash — sceneAmbientHex at falling alphas across
  //     the lower 58% of the frame. This is the key replacement for the
  //     old rgba(0,0,0,0.85) hard-black bottom stop.
  //   • Caption-base shade — a thin near-black pad only at the very
  //     bottom edge (the caption sits on a glass panel of its own so
  //     this is just an insurance layer for high-key photos).
  const ambientWashLayers = upperBias
    ? [
        // Soft top scrim
        "linear-gradient(to bottom, rgba(0,0,0,0.32) 0%, transparent 16%)",
        // Tinted ambient wash — the core fix for the "black letterbox" feel
        `linear-gradient(to top, ${hexWithAlpha(ambientHex, 0.78)} 0%, ${hexWithAlpha(ambientHex, 0.55)} 14%, ${hexWithAlpha(ambientHex, 0.28)} 32%, ${hexWithAlpha(ambientHex, 0.08)} 50%, transparent 60%)`,
        // Caption-base contrast pad — narrow and soft
        "linear-gradient(to top, rgba(0,0,0,0.28) 0%, transparent 12%)",
      ]
    : [
        "linear-gradient(to bottom, rgba(0,0,0,0.40) 0%, transparent 25%)",
        "linear-gradient(to top, rgba(0,0,0,0.50) 0%, transparent 35%)",
      ];

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        overflow: "hidden",
      }}
    >
      {/* ── Layer 0: brand-gradient base (always-visible fallback) ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            `linear-gradient(160deg, ${brand.primary} 0%, #1a1a2e 55%, ${brand.accent}33 100%)`,
        }}
      />

      {visualUrl && !isVideo && (
        <>
          {/* ── Layer 1: BLURRED AMBIENT FILL (same image, cover, blur) ──
              Fills the 9:16 frame with on-brand ambient pulled from the
              photo itself. Heavy blur + darken so it never competes with
              the contained subject above. Ken Burns lives here. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform:
                `translateX(${ambientOffsetX}px) scale(${ambientScale})`,
              transformOrigin: "center center",
              filter: "blur(36px) brightness(0.55) saturate(1.15)",
              // Tiny extra zoom on top of Ken Burns so blur edges never
              // reveal frame corners.
              margin: "-6%",
              width: "112%",
              height: "112%",
            }}
          >
            <Img
              src={visualUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
              }}
            />
          </div>

          {/* ── Layer 2: CONTAINED SUBJECT — the actual photo, whole.
              transform now stacks anchor-shift (~7% width counter to the
              Pharaoh side) on top of the time-based parallax drift, so
              the photo subject visually balances the mascot side. */}
          <div
            style={{
              position: "absolute",
              top: subjectTop,
              left: 0,
              width,
              height: subjectMaxHeight,
              transform: `translateX(${subjectOffsetX}px)`,
              display: "flex",
              alignItems: upperBias ? "flex-start" : "center",
              justifyContent: "center",
            }}
          >
            <Img
              src={visualUrl}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                width: "100%",
                height: "100%",
                // Density-aware fit: cover for wide shots (no void),
                // contain for everything else (preserve full subject).
                objectFit: subjectFitMode,
                objectPosition: "center",
                // Soft drop shadow grounds the image over the blurred fill
                // without making it feel like a sticker.
                filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.55))",
              }}
            />
          </div>
        </>
      )}

      {visualUrl && isVideo && (
        // Video case: keep objectFit:cover with the lighter parallax pan
        // and the original Ken Burns scale (video is already motion-rich;
        // double-rendering for ambient blur is too costly).
        // Anchor counter-shift applied via objectPosition X for video
        // since we can't translate the inner element without revealing edges.
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `translateX(${ambientOffsetX}px) scale(${ambientScale})`,
            transformOrigin: "center center",
            margin: "-6%",
            width: "112%",
            height: "112%",
          }}
        >
          <OffthreadVideo
            src={visualUrl}
            muted
            volume={0}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              // Anchor: shift focal point opposite to the Pharaoh side.
              // 50% = centered; <50% pulls subject left, >50% pulls right.
              objectPosition: `${
                subjectAnchor === "left"
                  ? "35%"
                  : subjectAnchor === "right"
                    ? "65%"
                    : "50%"
              } ${upperBias ? "22%" : "50%"}`,
            }}
          />
        </div>
      )}

      {/* ── Layer 3: scene-integrated ambient wash ──
          Replaces the old black-letterbox vignette. Tinted with the
          dominant scene color so the mascot band reads as scene light
          spilling down rather than a hard mask. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${vignetteOffsetX}px)`,
          background: ambientWashLayers.join(", "),
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
