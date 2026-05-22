import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
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
        bottom: 0,
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
          height: 3,
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
          paddingTop: 20,
          paddingBottom: 48,
          paddingLeft: 32,
          paddingRight: 32,
          minHeight: 100,
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
            fontSize: 52,
            lineHeight: 1.45,
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
          height: 8,
          background: `linear-gradient(90deg, ${brand.accent}, ${brand.primary}, ${brand.accent})`,
        }}
      />
    </div>
  );
};
