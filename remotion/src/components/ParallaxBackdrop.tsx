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
 * occupies the bottom band. Static — no zoom — so the subject never feels
 * like it's growing into the frame edges.
 *
 * Layer 3 (vignette): top + bottom gradient stops the captions and host
 * from competing visually with bright photo edges.
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
  // Subject itself gets a tiny pan to feel alive without losing focus.
  const subjectOffsetX = interpolate(progress, [0, 1], [-6, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const vignetteOffsetX = interpolate(progress, [0, 1], [-4, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subject layout: contain it within the upper region when a mascot
  // occupies the bottom band, otherwise contain it across the full frame.
  // 75% of frame height = subject area; 25% bottom reserved for mascot +
  // caption strip.
  const subjectMaxHeight = upperBias ? Math.round(height * 0.7) : height;
  const subjectTop = upperBias ? Math.round(height * 0.02) : 0;

  const isVideo = isVideoUrl(visualUrl);

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

          {/* ── Layer 2: CONTAINED SUBJECT — the actual photo, whole ── */}
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
                objectFit: "contain",
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
              objectPosition: upperBias ? "center 22%" : "center",
            }}
          />
        </div>
      )}

      {/* ── Layer 3: vignette overlay ──
          Lighter than before because the blurred ambient fill is already
          darkened — over-vignetting now muddies the subject. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${vignetteOffsetX}px)`,
          background: (upperBias
            ? [
                "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 18%)",
                "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 32%, transparent 55%)",
              ]
            : [
                "linear-gradient(to bottom, rgba(0,0,0,0.40) 0%, transparent 25%)",
                "linear-gradient(to top, rgba(0,0,0,0.70) 0%, transparent 40%)",
              ]
          ).join(", "),
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
