import React, { useEffect, useMemo, useState } from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Img,
  staticFile,
  continueRender,
  delayRender,
} from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Host — the fixed HonestStack brand mascot.
//
// The mascot is a SINGLE FIXED 2D Egyptian Pharaoh, identical in every video.
// Its two frames (mouth closed / open) are bundled with the Remotion project
// in `public/` and loaded via staticFile() — there is no per-video character.
//
// Behaviour:
//   • SMALL — occupies roughly the lower ~24% of the 1080x1920 frame height,
//     sitting in a bottom band ABOVE the caption strip. It never covers the
//     central backdrop (the event visual).
//   • GLIDES horizontally left↔right across the lower band over the whole
//     video duration (a slow translateX oscillation) with a gentle walk bob.
//   • "Speaks" by swapping the closed/open-mouth frame on audio amplitude.
//
// The mascot PNGs are generated on a solid pure-white background (the image
// model cannot reliably emit true alpha), so the white is keyed out to
// transparency once per asset in a canvas and memoised.
// ─────────────────────────────────────────────────────────────────────────────

// Bundled mascot frames — fixed, identical in every render.
const PHARAOH_CLOSED = staticFile("pharaoh-closed.png");
const PHARAOH_OPEN = staticFile("pharaoh-open.png");

// ─────────────────────────────────────────────────────────────────────────────
// whiteKey — module-level cache of white-background → transparent data URLs.
//
// The mascot frames sit on a solid #FFFFFF background. We knock the white out
// in a canvas once per URL and memoise the resulting transparent data URL so
// the Pharaoh composites cleanly over the backdrop.
// ─────────────────────────────────────────────────────────────────────────────
const whiteCache = new Map<string, string>();

/** Returns true for pixels close to pure white (the flat background). */
function isWhiteBg(r: number, g: number, b: number): boolean {
  // All three channels very high → flat white background, not character art.
  return r > 238 && g > 238 && b > 238;
}

function keyOutWhite(img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (isWhiteBg(r, g, b)) {
      px[i + 3] = 0; // fully transparent background
    } else if (r > 214 && g > 214 && b > 214) {
      // Soft feather on near-white edge pixels so the cut-out edge does not
      // carry a hard white halo: partially fade the alpha.
      const minC = Math.min(r, g, b);
      // minC 215→238 maps to alpha 255→0 (linear feather band).
      const alpha = Math.round(
        interpolateClamp(minC, 215, 238, 255, 0),
      );
      px[i + 3] = Math.min(px[i + 3], alpha);
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Tiny clamped linear map (avoids importing Remotion's interpolate here). */
function interpolateClamp(
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (v <= inMin) return outMin;
  if (v >= inMax) return outMax;
  const t = (v - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

/**
 * Loads an image, keys its solid-white background to transparent, and renders
 * the cut-out. Falls back to the raw image if processing fails. Uses
 * delayRender so the render waits for the one-time processing.
 */
const WhiteKeyImage: React.FC<{
  src: string;
  style?: React.CSSProperties;
}> = ({ src, style }) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(
    () => whiteCache.get(src) ?? "",
  );

  useEffect(() => {
    const cached = whiteCache.get(src);
    if (cached) {
      setResolvedSrc(cached);
      return;
    }
    const handle = delayRender(`white-key ${src}`);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let out: string;
      try {
        out = keyOutWhite(img);
      } catch {
        out = src; // canvas/CORS failure — use the original
      }
      whiteCache.set(src, out);
      setResolvedSrc(out);
      continueRender(handle);
    };
    img.onerror = () => {
      // Could not load — degrade gracefully (mascot simply won't show);
      // the render must not fail over an optional decorative asset.
      whiteCache.set(src, "");
      setResolvedSrc("");
      continueRender(handle);
    };
    img.src = src;
  }, [src]);

  if (!resolvedSrc) return null;
  return <Img src={resolvedSrc} style={style} />;
};

interface HostProps {
  voiceUrl: string;
  /** 0–1 entrance progress */
  entranceProgress: number;
  /**
   * Absolute frame at which this scene starts within the full composition.
   * `useCurrentFrame()` is Sequence-local, so this offset is added back to
   * sample the correct portion of the continuous narration audio AND to drive
   * one continuous horizontal glide across the whole video (rather than the
   * glide restarting each segment).
   */
  audioFrameOffset?: number;
}

export const Host: React.FC<HostProps> = ({
  voiceUrl,
  entranceProgress,
  audioFrameOffset = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // The narration plays across the whole composition; this Host lives inside
  // a per-segment Sequence. Add the segment's start offset to get the
  // absolute frame — used both to sample the matching audio slice and to make
  // the Pharaoh glide as one continuous path across the whole video.
  const absoluteFrame = frame + audioFrameOffset;

  // ── Audio-driven speech energy ────────────────────────────────────────────
  const audioData = useAudioData(voiceUrl);

  // Average mid-frequency speech energy for this frame (0–1-ish).
  const speechEnergy: number = useMemo(() => {
    if (!audioData) return 0;
    const amplitudes = visualizeAudio({
      fps,
      frame: absoluteFrame,
      audioData,
      numberOfSamples: 32,
    });
    // Mid-frequency bins (4–20) carry most vocal energy.
    const speechBins = amplitudes.slice(4, 20);
    return speechBins.reduce((a, b) => a + b, 0) / speechBins.length;
  }, [audioData, absoluteFrame, fps]);

  // ── Mascot sizing — SMALL, lower band only ────────────────────────────────
  // The Pharaoh occupies ~24% of the 1920px frame height and sits in a band
  // ABOVE the caption strip, so the central backdrop stays fully visible.
  const CAPTION_RESERVED = 180; // safe gap above the RTL caption strip
  const CHAR_HEIGHT = Math.round(height * 0.24); // ≈ 460 px (lower ~24%)
  // The source art is a 9:16-ish portrait; give the box a portrait aspect so
  // the full-body Pharaoh is not distorted (objectFit: contain anyway).
  const CHAR_WIDTH = Math.round(CHAR_HEIGHT * 0.62); // ≈ 285 px

  // ── Horizontal glide — slow left↔right walk across the lower band ─────────
  // One full left→right→left oscillation every ~14 s. Driven by the ABSOLUTE
  // frame so the path is continuous across segment boundaries (no restart).
  // The travel range keeps the whole mascot on-screen with a comfortable
  // side margin.
  const SIDE_MARGIN = 40;
  const glideMin = SIDE_MARGIN;
  const glideMax = width - CHAR_WIDTH - SIDE_MARGIN;
  const glidePeriod = fps * 14; // seconds for a full there-and-back cycle
  // Triangle-ish smooth oscillation via a sine wave (eased turn-arounds).
  const glidePhase = Math.sin((absoluteFrame / glidePeriod) * 2 * Math.PI);
  const glideX = interpolate(glidePhase, [-1, 1], [glideMin, glideMax]);

  // Face the direction of travel: flip horizontally on the return leg.
  // Derivative of sin is cos — positive = moving right.
  const movingRight =
    Math.cos((absoluteFrame / glidePeriod) * 2 * Math.PI) >= 0;
  const facing = movingRight ? 1 : -1;

  // ── Gentle walk bob — small vertical hop synced to a brisk step cadence ────
  const stepPeriod = fps * 0.62; // ~2 steps per second
  const stepPhase = (absoluteFrame / stepPeriod) * 2 * Math.PI;
  // |sin| gives a bob that touches down twice per cycle (a walk gait).
  const walkBob = -Math.abs(Math.sin(stepPhase)) * 9;
  // Slight body tilt rocking with the gait for a livelier walk.
  const walkRock = Math.sin(stepPhase) * 2.2;

  // ── Entrance slide-up ─────────────────────────────────────────────────────
  const slideY = interpolate(entranceProgress, [0, 1], [120, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(entranceProgress, [0, 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Speech-driven head bob (livens the talking) ───────────────────────────
  const speechBob = -Math.min(speechEnergy, 0.6) * 6;

  // Mouth swap: show the open frame when speech energy crosses the threshold.
  const mouthOpen = speechEnergy >= 0.13;

  const frameImgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: "bottom center",
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: CAPTION_RESERVED,
        left: 0,
        width: CHAR_WIDTH,
        height: CHAR_HEIGHT,
        transform: [
          `translateX(${glideX}px)`,
          `translateY(${slideY + walkBob + speechBob}px)`,
          `rotate(${walkRock}deg)`,
          // Flip to face the direction of travel.
          `scaleX(${facing})`,
        ].join(" "),
        transformOrigin: "bottom center",
        opacity,
        // Soft contact shadow grounding the mascot over the backdrop.
        filter: "drop-shadow(0 14px 16px rgba(0,0,0,0.5))",
      }}
    >
      {/* Crossfade the two mouth frames. Each is white-keyed (white → alpha)
          so the Pharaoh composites cleanly. Stacked + absolutely positioned
          so the swap has no layout cost. */}
      <WhiteKeyImage
        src={PHARAOH_CLOSED}
        style={{ ...frameImgStyle, opacity: mouthOpen ? 0 : 1 }}
      />
      <WhiteKeyImage
        src={PHARAOH_OPEN}
        style={{ ...frameImgStyle, opacity: mouthOpen ? 1 : 0 }}
      />
    </div>
  );
};
