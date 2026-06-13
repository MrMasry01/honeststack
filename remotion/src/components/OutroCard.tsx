import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Cairo";

// Pharaoh in the outro (May 2026) — walk-out-right pose (looking back
// over shoulder, waving goodbye). Reinforces the "see you next round"
// cadence the CTA text promises ("تابعوني — أنا بَنزّل ٤ مرّات في اليوم").
// Placed bottom-left so it doesn't crowd the centered handle + button.
//
// Source asset is pre-keyed (May 28 2026) — the original PNG had a
// solid white background which showed through the dark outro gradient
// as a visible white rectangle. ffmpeg `colorkey=0xFFFFFF:0.18:0.08`
// was applied in-place to give the asset a proper alpha channel.
// Host.tsx's runtime WhiteKey processing is a no-op on an already-keyed
// PNG, so the pose-mode render path still works correctly.
const PHARAOH_WAVE_GOODBYE = staticFile("poses/walk-out-right.png");

loadFont("normal", {
  weights: ["700", "800", "900"],
  subsets: ["arabic", "latin"],
});

interface OutroCardProps {
  outroHandle: string;
  brand: { primary: string; accent: string };
  durationInFrames: number;
}

export const OutroCard: React.FC<OutroCardProps> = ({
  outroHandle,
  brand,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Handle scale spring
  const handleScale = spring({
    fps,
    frame,
    config: { damping: 12, stiffness: 80 },
    durationInFrames: 25,
  });

  const handleY = interpolate(frame, [0, 20], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ctaOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Pulsing follow button
  const pulseScale = 1 + 0.04 * Math.sin((frame / fps) * 2 * Math.PI * 1.2);

  // Pharaoh entrance — slides in from off-screen left, slightly delayed
  // so handle reads first, then mascot waves "bye".
  const pharaohSpring = spring({
    fps,
    frame: Math.max(0, frame - 10),
    config: { damping: 14, stiffness: 90 },
    durationInFrames: 28,
  });
  const pharaohX = interpolate(pharaohSpring, [0, 1], [-300, 0]);
  const pharaohOpacity = interpolate(pharaohSpring, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });
  // Subtle wave / bob over the 3-second outro.
  const pharaohBob = -Math.abs(Math.sin((frame / fps) * Math.PI * 1.4)) * 6;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width,
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(180deg, ${brand.primary} 0%, #0d0d1a 60%, #000000 100%)`,
      }}
    >
      {/* Background ring decorations */}
      {[300, 500, 700].map((size, i) => (
        <div
          key={size}
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: "50%",
            border: `1px solid ${brand.accent}${18 - i * 4}`,
            animation: "none",
            transform: `rotate(${frame * (0.3 - i * 0.08)}deg)`,
          }}
        />
      ))}

      {/* Social handle */}
      <div
        style={{
          transform: `scale(${handleScale}) translateY(${handleY}px)`,
          textAlign: "center",
          marginBottom: 48,
        }}
      >
        <div
          style={{
            fontFamily: "Cairo, monospace",
            fontWeight: 900,
            fontSize: 88,
            color: brand.accent,
            textShadow: [
              `0 0 60px ${brand.accent}88`,
              `0 0 120px ${brand.accent}44`,
              "0 4px 20px rgba(0,0,0,0.8)",
            ].join(", "),
            letterSpacing: -1,
          }}
        >
          {outroHandle}
        </div>
      </div>

      {/* CTA Arabic text — cadence promise: viewer knows when to come back */}
      <div
        dir="rtl"
        lang="ar"
        style={{ opacity: ctaOpacity, textAlign: "center", padding: "0 80px" }}
      >
        <p
          style={{
            fontFamily: "Cairo, sans-serif",
            fontWeight: 800,
            fontSize: 48,
            color: "#FFFFFF",
            margin: "0 0 12px",
            lineHeight: 1.3,
            textShadow: "0 2px 12px rgba(0,0,0,0.8)",
          }}
        >
          قول رأيك تحت 👇
        </p>
        <p
          style={{
            fontFamily: "Cairo, sans-serif",
            fontWeight: 700,
            fontSize: 38,
            color: brand.accent,
            margin: "0 0 32px",
            lineHeight: 1.3,
            textShadow: `0 2px 12px ${brand.accent}55`,
          }}
        >
          أنا بَقرا كل كومنت
        </p>
      </div>

      {/* Follow button */}
      <div
        style={{
          opacity: ctaOpacity,
          transform: `scale(${pulseScale})`,
          background: brand.accent,
          borderRadius: 60,
          paddingTop: 20,
          paddingBottom: 20,
          paddingLeft: 56,
          paddingRight: 56,
          boxShadow: `0 8px 40px ${brand.accent}66`,
        }}
      >
        <span
          style={{
            fontFamily: "Cairo, sans-serif",
            fontWeight: 800,
            fontSize: 36,
            color: "#000000",
            letterSpacing: 0.5,
          }}
        >
          Follow Now
        </span>
      </div>

      {/* Bottom FIFA badge */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          opacity: ctaOpacity * 0.6,
        }}
      >
        <span
          style={{
            fontFamily: "Cairo, sans-serif",
            fontWeight: 400,
            fontSize: 22,
            color: `${brand.accent}88`,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          FIFA World Cup 2026 • USA Mexico Canada
        </span>
      </div>

      {/* Pharaoh waving goodbye — bottom-left, ~32% frame height.
          Stays clear of the centered handle + button so it accents
          rather than crowds. Soft accent halo behind the mascot. */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 40,
          width: Math.round(height * 0.32 * 0.62),
          height: Math.round(height * 0.32),
          transform: `translate(${pharaohX}px, ${pharaohBob}px)`,
          opacity: pharaohOpacity,
          pointerEvents: "none",
          filter: `drop-shadow(0 14px 24px rgba(0,0,0,0.55)) drop-shadow(0 0 24px ${brand.accent}33)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 50% 90%, ${brand.accent}33 0%, transparent 55%)`,
            pointerEvents: "none",
          }}
        />
        <Img
          src={PHARAOH_WAVE_GOODBYE}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "bottom center",
          }}
        />
      </div>
    </div>
  );
};
