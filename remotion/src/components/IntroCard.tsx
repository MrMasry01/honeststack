import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  OffthreadVideo,
  staticFile,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Cairo";

// Pharaoh mascot brought into intro/outro (May 2026). Previously the
// intro was logo-only; introducing the host upfront primes the viewer
// to expect a personality, not just a news ticker. We use the
// `celebrating` pose (arms up, joyful) — reads as "welcome to the
// show" and matches the WC 2026 hype framing.
//
// Source asset (May 28 2026 upgrade): the looped pre-keyed WebM with
// alpha (Higgsfield image-to-video → ffmpeg chromakey). Previously
// this was a raw .png and the white background visibly showed through
// the gradient backdrop — the drop-shadow + spotlight that were meant
// to mask the white edges weren't enough at 1080p production res.
// The WebM has natural breathing/blinking motion so the intro now
// reads as "the Pharaoh is alive and greeting you" rather than a
// static sticker pasted on the card.
const PHARAOH_CELEBRATING_WEBM = staticFile("poses/celebrating.webm");

loadFont("normal", {
  weights: ["700", "800", "900"],
  subsets: ["arabic", "latin"],
});

interface IntroCardProps {
  introText: string;
  brand: { primary: string; accent: string; logo_url: string };
  durationInFrames: number;
}

export const IntroCard: React.FC<IntroCardProps> = ({
  introText,
  brand,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Logo spring entrance
  const logoScale = spring({
    fps,
    frame,
    config: { damping: 14, stiffness: 100 },
    durationInFrames: 30,
  });

  // Title slides up
  const titleY = interpolate(frame, [8, 28], [60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleOpacity = interpolate(frame, [8, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Exit fade out in last 15 frames
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  // Animated ring around logo
  const ringRotation = (frame / durationInFrames) * 360;

  // Pharaoh entrance — slight delay vs logo so the eye reads
  // logo→title→mascot in sequence. Pops up from below.
  const pharaohSpring = spring({
    fps,
    frame: Math.max(0, frame - 14),
    config: { damping: 10, stiffness: 90 },
    durationInFrames: 22,
  });
  const pharaohY = interpolate(pharaohSpring, [0, 1], [180, 0]);
  const pharaohOpacity = interpolate(pharaohSpring, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });
  // Subtle breath bob across the 3-second card.
  const pharaohBreath = Math.sin((frame / fps) * 2 * Math.PI * 0.6) * 4;

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
        background: `linear-gradient(160deg, #0A0A1A 0%, #1a1a2e 50%, ${brand.primary} 100%)`,
        opacity: exitOpacity,
      }}
    >
      {/* Background decorative elements */}
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "50%",
          transform: `translate(-50%, -50%) rotate(${ringRotation}deg)`,
          width: 600,
          height: 600,
          borderRadius: "50%",
          border: `2px solid ${brand.accent}22`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "15%",
          left: "50%",
          transform: `translate(-50%, -50%) rotate(${-ringRotation * 0.6}deg)`,
          width: 450,
          height: 450,
          borderRadius: "50%",
          border: `2px solid ${brand.accent}33`,
          pointerEvents: "none",
        }}
      />

      {/* Logo */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          marginBottom: 40,
          width: 120,
          height: 120,
          borderRadius: 24,
          overflow: "hidden",
          background: `${brand.accent}22`,
          border: `2px solid ${brand.accent}66`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 40px ${brand.accent}44`,
        }}
      >
        {brand.logo_url && brand.logo_url.startsWith("http") ? (
          <Img
            src={brand.logo_url}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          // Fallback: stylised "HS" monogram
          <span
            style={{
              fontFamily: "Cairo, sans-serif",
              fontWeight: 900,
              fontSize: 40,
              color: brand.accent,
              letterSpacing: -2,
            }}
          >
            HS
          </span>
        )}
      </div>

      {/* World Cup badge */}
      <div
        style={{
          background: `${brand.accent}20`,
          border: `1px solid ${brand.accent}55`,
          borderRadius: 100,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 24,
          paddingRight: 24,
          marginBottom: 24,
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
        }}
      >
        <span
          style={{
            fontFamily: "Cairo, sans-serif",
            fontWeight: 600,
            fontSize: 26,
            color: brand.accent,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          FIFA World Cup 2026
        </span>
      </div>

      {/* Main Arabic intro text */}
      <div
        dir="rtl"
        lang="ar"
        style={{
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
          padding: "0 60px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "'Cairo', Arial, sans-serif",
            fontWeight: 900,
            fontSize: 80,
            color: "#FFFFFF",
            margin: 0,
            lineHeight: 1.3,
            textShadow: `0 4px 24px rgba(0,0,0,0.8), 0 0 60px ${brand.accent}33`,
          }}
        >
          {introText}
        </h1>
      </div>

      {/* Decorative gold divider */}
      <div
        style={{
          marginTop: 40,
          width: 120,
          height: 3,
          background: `linear-gradient(90deg, transparent, ${brand.accent}, transparent)`,
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
        }}
      />

      {/* HonestStack brand tag */}
      <div
        style={{
          marginTop: 24,
          transform: `translateY(${titleY}px)`,
          opacity: titleOpacity,
        }}
      >
        <span
          style={{
            fontFamily: "Cairo, sans-serif",
            fontWeight: 400,
            fontSize: 28,
            color: `${brand.accent}CC`,
            letterSpacing: 1,
          }}
        >
          HonestStack
        </span>
      </div>

      {/* Pharaoh mascot — anchored bottom-center, ~42% frame height.
          Sits BEHIND text via z-index because the gradient backdrop sits
          underneath everything. Pre-keyed WebM (alpha channel baked in by
          ffmpeg chromakey) — no runtime keying needed, composites cleanly
          on the gradient. Plays the natural breath/blink motion baked into
          the Higgsfield I2V clip, looped for the 3-second intro. */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          width: Math.round(height * 0.42 * 0.65),
          height: Math.round(height * 0.42),
          transform: `translate(-50%, ${pharaohY + pharaohBreath}px)`,
          opacity: pharaohOpacity,
          pointerEvents: "none",
          filter: `drop-shadow(0 18px 32px rgba(0,0,0,0.55)) drop-shadow(0 0 30px ${brand.accent}33)`,
        }}
      >
        {/* Soft contact-pool spotlight so the mascot reads as standing
            on a lit stage rather than floating in a gradient. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 50% 90%, ${brand.accent}33 0%, transparent 55%)`,
            pointerEvents: "none",
          }}
        />
        <OffthreadVideo
          src={PHARAOH_CELEBRATING_WEBM}
          loop
          muted
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
