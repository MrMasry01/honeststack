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

type SubjectAnchor = "left" | "center" | "right";

interface CaptionStripProps {
  textAr: string;
  brand: { primary: string; accent: string };
  /** 0–1 entrance progress for the strip */
  entranceProgress: number;
  /**
   * Where the photo subject sits horizontally. Caption anchors on the
   * SAME side as the subject so it doesn't crowd the Pharaoh, which
   * lives on the opposite side per the opposite-side rule.
   *   subject left  → caption left
   *   subject right → caption right
   *   subject center → caption centered (slight horizontal bias optional)
   */
  subjectAnchor?: SubjectAnchor;
  /**
   * Dominant scene color — used as the underline accent tint so the
   * caption visually echoes the ambient wash above instead of fighting it.
   */
  sceneAmbientHex?: string;
}

/** Validate #RRGGBB hex. */
function isValidHex(hex: string | undefined): hex is string {
  return Boolean(hex && /^#[0-9a-fA-F]{6}$/.test(hex));
}

/**
 * RTL Arabic caption — lower-third lozenge style.
 *
 * Design changes vs. the previous full-width opaque band:
 *   • Width is now 78% of the frame (was 100%), so a Pharaoh-band lives
 *     beside it instead of being stacked above a hard slab.
 *   • Background is glass — semi-transparent near-black with a backdrop
 *     blur — so the photo's ambient color still reads through. The
 *     previous solid brand.primary band looked like a TV chyron and made
 *     the scene feel cut in half.
 *   • Top edge gets a thin accent stripe (tinted with sceneAmbientHex,
 *     falling back to brand.accent) instead of a hard 3px border.
 *   • Anchored on the same side as the photo subject (opposite-side rule
 *     puts Pharaoh on the other side). Centered subjects → centered caption.
 *   • Text shadow stack is preserved at FULL intensity so legibility on
 *     bright photos is untouched — the panel can afford to be lower-opacity
 *     because the text wins on its own.
 *   • `dir="rtl"` and `lang="ar"` ensure correct right-to-left shaping.
 *   • Cairo Bold loaded via @remotion/google-fonts (subset: Arabic).
 */
export const CaptionStrip: React.FC<CaptionStripProps> = ({
  textAr,
  brand,
  entranceProgress,
  subjectAnchor = "center",
  sceneAmbientHex,
}) => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();

  // ── Proportional sizing — works at any canvas height ────────────────────
  // Previous version used absolute pixel values (52px font, 100px minHeight,
  // 48px padding) sized for a 1080x1920 canvas. After dropping render
  // resolution to 720x1280 those constants became proportionally HUGE —
  // captions wrapped to 5-6 lines covering most of the frame and the
  // Pharaoh mascot. All sizes are now driven from the canvas height.
  const fontSize = Math.round(height * 0.028);    // 720 -> 36, 1080 -> 54
  const padX = Math.round(height * 0.022);         // 720 -> 28, 1080 -> 42
  const padTop = Math.round(height * 0.014);       // 720 -> 18, 1080 -> 27
  const padBottom = Math.round(height * 0.016);    // 720 -> 21, 1080 -> 31
  const minStripH = Math.round(height * 0.055);    // 720 -> 70, 1080 -> 105
  // Lift further off the bottom edge — the lozenge floats now, it isn't
  // welded to the frame. Gives the Pharaoh band ~30 extra px of breathing room.
  const bottomGap = Math.round(height * 0.025);    // 720 -> 32, 1080 -> 48
  const accentBarH = Math.max(2, Math.round(height * 0.0035));

  // Lozenge width — 78% of frame width by default; shrinks slightly for
  // centered captions so they don't visually swallow the whole lower band.
  const lozengeWidthPct = subjectAnchor === "center" ? 0.72 : 0.78;
  const lozengeWidth = Math.round(width * lozengeWidthPct);

  // Outer side margin — used when caption is anchored left or right.
  const sideMargin = Math.round(width * 0.045); // 1080 -> ~49 px

  // Horizontal placement. Caption sits on the SAME side as the photo subject
  // (Pharaoh is on the opposite side).
  const horizontalStyle: React.CSSProperties =
    subjectAnchor === "left"
      ? { left: sideMargin, right: "auto" }
      : subjectAnchor === "right"
        ? { left: "auto", right: sideMargin }
        : {
            left: "50%",
            right: "auto",
            transform: `translateX(-50%)`,
          };

  // Border radius — slightly tighter so it reads as a panel, not a balloon.
  const radius = Math.round(height * 0.018); // 1080 -> ~35

  const slideY = interpolate(entranceProgress, [0, 1], [60, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = interpolate(entranceProgress, [0, 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle pulsing glow on the accent stripe to draw the eye.
  const glowOpacity = 0.45 + 0.15 * Math.sin((frame / 30) * Math.PI);

  // Accent tint — prefer the dominant scene color so the caption echoes
  // the ambient wash; fall back to brand.accent.
  const accentTint = isValidHex(sceneAmbientHex)
    ? sceneAmbientHex
    : brand.accent;

  // Build the transform — centered captions need both slide AND center-shift
  // in the same transform so they don't fight each other.
  const transform =
    subjectAnchor === "center"
      ? `translateX(-50%) translateY(${slideY}px)`
      : `translateY(${slideY}px)`;

  return (
    <div
      style={{
        position: "absolute",
        bottom: bottomGap,
        ...horizontalStyle,
        width: lozengeWidth,
        transform,
        opacity,
        display: "flex",
        flexDirection: "column",
        // Rounded glass panel for the whole lozenge (clips children).
        borderRadius: radius,
        overflow: "hidden",
        // Soft outer shadow lifts the lozenge off the ambient wash so it
        // doesn't visually merge into the scene background.
        boxShadow:
          "0 18px 48px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35)",
      }}
    >
      {/* Thin top accent stripe (replaces the hard 3px border). Tinted
          with the ambient scene color so the caption feels echoed by the
          surrounding light. Subtle pulse for motion. */}
      <div
        style={{
          height: accentBarH,
          background: `linear-gradient(90deg, ${accentTint}00, ${accentTint}, ${accentTint}00)`,
          opacity: glowOpacity + 0.4,
          boxShadow: `0 0 14px 2px ${accentTint}AA`,
        }}
      />

      {/* Glass caption body — semi-transparent near-black with backdrop
          blur. Photo ambient still reads through; legibility is carried
          by the text shadow stack on the <p> below. */}
      <div
        style={{
          // Slightly cool near-black so it composites well over any hue.
          background:
            "linear-gradient(180deg, rgba(8,8,12,0.62) 0%, rgba(8,8,12,0.74) 100%)",
          backdropFilter: "blur(14px) saturate(1.2)",
          // Fallback for browsers without backdrop-filter (Chromium has it,
          // Remotion uses Chromium → always present in production renders).
          WebkitBackdropFilter: "blur(14px) saturate(1.2)",
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
            // Subject-side caption gets aligned to the subject side (RTL
            // means visually-end vs. visually-start map to right/left).
            // Centered caption stays centered.
            textAlign:
              subjectAnchor === "center"
                ? "center"
                : // RTL: "start" is right, "end" is left.
                  subjectAnchor === "right"
                  ? "start"
                  : "end",
            margin: 0,
            letterSpacing: "0.01em",
            // PRESERVED triple-shadow stack — this is what wins on bright
            // photos. The glass panel is lower opacity than the old band,
            // so the text shadow stays at the original intensity.
            textShadow: [
              "0 2px 8px rgba(0,0,0,0.95)",
              "0 0 40px rgba(0,0,0,0.75)",
              `0 0 2px ${accentTint}88`,
            ].join(", "),
            // Arabic ligature support
            fontFeatureSettings: '"liga" 1, "calt" 1',
          }}
        >
          {textAr}
        </p>
      </div>
    </div>
  );
};
