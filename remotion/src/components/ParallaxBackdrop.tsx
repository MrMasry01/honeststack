import React from "react";
import {
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Img,
} from "remotion";
import type { KenBurns, Brand } from "../schema";

interface ParallaxBackdropProps {
  visualUrl: string;
  durationInFrames: number;
  kenBurns?: KenBurns;
  brand: Brand;
  /** 0–1 progress through this segment */
  progress?: number;
  /**
   * When true, a per-video character avatar occupies the lower portion of
   * the frame: the event visual is biased upward (focal content shifted to
   * the top) and a heavier bottom gradient is drawn so the character
   * composites cleanly against the backdrop.
   */
  upperBias?: boolean;
}

/**
 * Three-layer parallax backdrop.
 *
 * Layer 0 (bottom/furthest): a blurred, darkened brand-gradient fill — always visible,
 *   acts as a safe colour fallback when the image hasn't loaded.
 * Layer 1 (mid): the segment's visual_url, placed on a "billboard" plane that
 *   receives the Ken Burns scale interpolation.
 * Layer 2 (top/closest): a translucent gradient vignette so the host and captions
 *   pop against any image.
 *
 * The three layers shift horizontally at different rates (parallax) using the
 * segment's progress (0→1 over its duration).
 */
export const ParallaxBackdrop: React.FC<ParallaxBackdropProps> = ({
  visualUrl,
  durationInFrames,
  kenBurns = { from: 1.0, to: 1.1 },
  brand,
  upperBias = false,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const progress = Math.min(frame / Math.max(durationInFrames - 1, 1), 1);

  // Ken Burns: smoothly interpolate scale from kenBurns.from → kenBurns.to
  const scale = interpolate(progress, [0, 1], [kenBurns.from, kenBurns.to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Parallax horizontal offsets per layer (depth illusion):
  //   Layer 0 (BG): no shift — it's the base colour
  //   Layer 1 (image): subtle horizontal pan, up to ±20px
  //   Layer 2 (vignette): micro shift, up to ±6px
  const imgOffsetX = interpolate(progress, [0, 1], [-20, 20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const vignetteOffsetX = interpolate(progress, [0, 1], [-6, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
      {/* ── Layer 0: brand-gradient base (always visible fallback) ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(160deg, ${brand.primary} 0%, #1a1a2e 55%, ${brand.accent}33 100%)`,
        }}
      />

      {/* ── Layer 1: billboard image with Ken Burns ── */}
      {visualUrl && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `translateX(${imgOffsetX}px) scale(${scale})`,
            transformOrigin: "center center",
            // Allow slight overflow during zoom/pan without revealing edges
            margin: "-10%",
            width: "120%",
            height: "120%",
          }}
        >
          <Img
            src={visualUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              // When a character avatar fills the lower portion, anchor the
              // image's focal content toward the top so the "event" reads in
              // the upper portion of the frame.
              objectPosition: upperBias ? "center 22%" : "center",
            }}
            // Remotion's Img pauses rendering until the image is loaded
            onError={() => {
              // Falls back gracefully to the brand-gradient layer below
            }}
          />
        </div>
      )}

      {/* ── Layer 2: vignette overlay (parallax top layer) ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateX(${vignetteOffsetX}px)`,
          background: (upperBias
            ? [
                // Heavier bottom fade: the lower portion becomes a darkened
                // stage for the character; the event stays bright up top.
                "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 22%)",
                "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 38%, transparent 60%)",
              ]
            : [
                "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 30%)",
                "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 45%)",
              ]
          ).join(", "),
        }}
      />
    </div>
  );
};
