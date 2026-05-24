import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
// @remotion/google-fonts — loads the Arabic font at render time
import { loadFont } from "@remotion/google-fonts/Cairo";

// Load only the weights we need to minimise network requests during rendering.
// Bold (800) and ExtraBold (900) cover caption and branding use-cases.
loadFont("normal", {
  weights: ["700", "800", "900"],
  subsets: ["arabic", "latin"],
});

interface CaptionStripProps {
  textAr: string;
  brand: { primary: string; accent: string };
  /** 0–1 entrance progress for the strip */
  entranceProgress: number;
}

/**
 * RTL Arabic caption strip anchored to the bottom of the frame.
 *
 * Design decisions:
 * - Full-width band with brand-accent background for maximum legibility.
 * - `dir="rtl"` and `lang="ar"` ensure correct right-to-left shaping.
 * - Cairo Bold loaded via @remotion/google-fonts (subset: Arabic).
 * - Drop-shadow on the text for visibility when brand.accent is light.
 * - Slides up from -80px on entrance to rest position.
 */
export const CaptionStrip: React.FC<CaptionStripProps> = ({
  textAr,
  brand,
  entranceProgress,
}) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  // ── Proportional sizing — works at any canvas height ────────────────────
  // Previous version used absolute pixel values (52px font, 100px minHeight,
  // 48px padding) sized for a 1080x1920 canvas. After dropping render
  // resolution to 720x1280 those constants became proportionally HUGE —
  // captions wrapped to 5-6 lines covering most of the frame and the
  // Pharaoh mascot. All sizes are now driven from the canvas height.
  const fontSize = Math.round(height * 0.028);    // 720 -> 36, 1080 -> 54
  const padX = Math.round(height * 0.022);         // 720 -> 28, 1080 -> 42
  const padTop = Math.round(height * 0.012);       // 720 -> 15, 1080 -> 22
  const padBottom = Math.round(height * 0.020);    // 720 -> 26, 1080 -> 38
  const minStripH = Math.round(height * 0.055);    // 720 -> 70, 1080 -> 105
  const bottomGap = Math.round(height * 0.012);    // small lift off the very edge
  const accentBarH = Math.round(height * 0.006);   // 720 -> 4, 1080 -> 6
  const glowLineH = Math.max(2, Math.round(height * 0.002));

  const slideY = interpolate(entranceProgress, [0, 1], [80, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = interpolate(entranceProgress, [0, 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle pulsing glow on the accent strip to draw the eye
  const glowOpacity = 0.15 + 0.1 * Math.sin((frame / 30) * Math.PI);

  return (
    <div
      style={{
        position: "absolute",
        bottom: bottomGap,
        left: 0,
        right: 0,
        transform: `translateY(${slideY}px)`,
        opacity,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Glow line above the strip */}
      <div
        style={{
          height: glowLineH,
          background: brand.accent,
          opacity: glowOpacity + 0.6,
          boxShadow: `0 0 12px 4px ${brand.accent}`,
        }}
      />

      {/* Caption background */}
      <div
        style={{
          background: `linear-gradient(90deg, ${brand.primary}F0, ${brand.primary}E8)`,
          borderTop: `3px solid ${brand.accent}`,
          paddingTop: padTop,
          paddingBottom: padBottom,
          paddingLeft: padX,
          paddingRight: padX,
          minHeight: minStripH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          dir="rtl"
          lang="ar"
          style={{
            fontFamily: "'Cairo', 'IBM Plex Sans Arabic', Arial, sans-serif",
            fontWeight: 800,
            fontSize,
            lineHeight: 1.35,
            color: "#FFFFFF",
            textAlign: "center",
            margin: 0,
            letterSpacing: "0.01em",
            textShadow: [
              "0 2px 8px rgba(0,0,0,0.9)",
              "0 0 40px rgba(0,0,0,0.7)",
              `0 0 2px ${brand.accent}66`,
            ].join(", "),
            // Arabic ligature support
            fontFeatureSettings: '"liga" 1, "calt" 1',
          }}
        >
          {textAr}
        </p>
      </div>

      {/* Brand accent bottom bar */}
      <div
        style={{
          height: accentBarH,
          background: `linear-gradient(90deg, ${brand.accent}, ${brand.primary}, ${brand.accent})`,
        }}
      />
    </div>
  );
};
