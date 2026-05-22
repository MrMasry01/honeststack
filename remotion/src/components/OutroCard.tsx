import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Cairo";

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

      {/* CTA Arabic text */}
      <div
        dir="rtl"
        lang="ar"
        style={{ opacity: ctaOpacity, textAlign: "center", padding: "0 80px" }}
      >
        <p
          style={{
            fontFamily: "Cairo, sans-serif",
            fontWeight: 700,
            fontSize: 44,
            color: "#FFFFFFCC",
            margin: "0 0 32px",
            lineHeight: 1.4,
            textShadow: "0 2px 12px rgba(0,0,0,0.8)",
          }}
        >
          تابعونا لأحدث أخبار كأس العالم
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
    </div>
  );
};
