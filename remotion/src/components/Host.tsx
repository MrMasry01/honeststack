import React, { useEffect, useMemo, useState } from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  OffthreadVideo,
  staticFile,
  continueRender,
  delayRender,
} from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Host — the fixed HonestStack brand mascot.
//
// Two modes:
//   1. IDLE-TALK (default): the two-frame Pharaoh (mouth-closed / mouth-open),
//      audio-driven mouth swap, glides slowly across the lower band.
//   2. POSE: when the segment carries a pharaoh_pose, the Pharaoh swaps to
//      the matching pose PNG from the pose library. Each pose has its own
//      anchor + entry animation so the Pharaoh "peeks", "points", etc. into
//      the scene with intent.
//
// All Pharaoh PNGs are on solid white backgrounds — WhiteKeyImage knocks the
// white out to transparency once per asset and memoises the result.
// ─────────────────────────────────────────────────────────────────────────────

const PHARAOH_CLOSED = staticFile("pharaoh-closed.png");
const PHARAOH_OPEN = staticFile("pharaoh-open.png");

export type PharaohPose =
  | "idle-talk"
  | "peek-left"
  | "peek-right"
  | "point-up-right"
  | "point-down"
  | "surprised"
  | "sarcastic-shrug"
  | "count-fingers"
  | "walk-in-left"
  | "walk-out-right"
  | "crying"
  | "celebrating";

export type SceneDensity = "close" | "mid" | "wide";
export type SubjectAnchor = "left" | "center" | "right";

interface PosePreset {
  src: string | null;
  /** Optional pre-keyed WebM with alpha (Higgsfield image-to-video → ffmpeg
   *  chromakey). When set, takes priority over `src` — Pharaoh plays as a
   *  looped transparent video instead of a static PNG. WhiteKeyImage is
   *  skipped because the WebM already has transparency baked in. */
  videoSrc?: string;
  anchor: "glide" | "bottom-left" | "bottom-center" | "bottom-right" |
    "edge-left" | "edge-right";
  animation: "glide" | "slide-from-left" | "slide-from-right" |
    "walk-from-left" | "walk-out-right" | "fade-in" | "scale-pop";
  scaleMul: number;
  facing: 1 | -1 | null;
  /** Whether this pose is a directional "reaction" pose (peek/point) — these
   * are the ones that benefit from mirroring away from the subject. */
  reactive: boolean;
}

const POSE_PRESETS: Record<PharaohPose, PosePreset> = {
  "idle-talk":       { src: null, anchor: "glide",         animation: "glide",            scaleMul: 1.0,  facing: null, reactive: false },
  "peek-left":       { src: staticFile("poses/peek-left.png"),    anchor: "edge-left",     animation: "slide-from-left",  scaleMul: 1.15, facing: 1,    reactive: true  },
  "peek-right":      { src: staticFile("poses/peek-right.png"),   anchor: "edge-right",    animation: "slide-from-right", scaleMul: 1.15, facing: -1,   reactive: true  },
  "point-up-right":  { src: staticFile("poses/point-up-right.png"),anchor: "bottom-right", animation: "fade-in",          scaleMul: 1.05, facing: null, reactive: true  },
  "point-down":      { src: staticFile("poses/point-down.png"),   anchor: "bottom-center", animation: "scale-pop",        scaleMul: 1.1,  facing: null, reactive: false },
  "surprised":       { src: staticFile("poses/surprised.png"),    anchor: "bottom-right",  animation: "scale-pop",        scaleMul: 1.2,  facing: null, reactive: false },
  "sarcastic-shrug": { src: staticFile("poses/sarcastic-shrug.png"),anchor: "bottom-right",animation: "fade-in",          scaleMul: 1.05, facing: null, reactive: false },
  "count-fingers":   { src: staticFile("poses/count-fingers.png"),anchor: "bottom-center", animation: "scale-pop",        scaleMul: 1.05, facing: null, reactive: false },
  "walk-in-left":    { src: staticFile("poses/walk-in-left.png"), anchor: "bottom-left",   animation: "walk-from-left",   scaleMul: 1.0,  facing: null, reactive: false },
  "walk-out-right":  { src: staticFile("poses/walk-out-right.png"),anchor: "bottom-right", animation: "walk-out-right",   scaleMul: 1.0,  facing: null, reactive: false },
  "crying":          { src: staticFile("poses/crying.png"),       anchor: "bottom-center", animation: "fade-in",          scaleMul: 1.1,  facing: null, reactive: false },
  "celebrating":     { src: staticFile("poses/celebrating.png"),  anchor: "bottom-center", animation: "scale-pop",        scaleMul: 1.2,  facing: null, reactive: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// whiteKey — module-level cache of white-background → transparent data URLs.
// ─────────────────────────────────────────────────────────────────────────────
const whiteCache = new Map<string, string>();

function isWhiteBg(r: number, g: number, b: number): boolean {
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
      px[i + 3] = 0;
    } else if (r > 214 && g > 214 && b > 214) {
      const minC = Math.min(r, g, b);
      const alpha = Math.round(
        interpolateClamp(minC, 215, 238, 255, 0),
      );
      px[i + 3] = Math.min(px[i + 3], alpha);
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}

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

// Parse #RRGGBB → {r,g,b}. Returns null if not a 6-digit hex.
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgba(hex: string, alpha: number, fallback = "#0A0A0A"): string {
  const c = parseHex(hex) ?? parseHex(fallback) ?? { r: 10, g: 10, b: 10 };
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

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
        out = src;
      }
      whiteCache.set(src, out);
      setResolvedSrc(out);
      continueRender(handle);
    };
    img.onerror = () => {
      whiteCache.set(src, "");
      setResolvedSrc("");
      continueRender(handle);
    };
    img.src = src;
  }, [src]);

  if (!resolvedSrc) return null;
  return <Img src={resolvedSrc} style={style} />;
};

// ─────────────────────────────────────────────────────────────────────────────
// Scene-awareness helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Multiplier applied on top of per-pose scaleMul. close > mid > wide. */
function densityScale(d: SceneDensity): number {
  switch (d) {
    case "close": return 1.45; // big subjects need a bigger reactor
    case "wide":  return 1.0;
    case "mid":
    default:      return 1.13;
  }
}

/** Edge-anchor vertical position as a fraction of frame height. */
function edgeBottomFraction(d: SceneDensity): number {
  switch (d) {
    case "close": return 0.42; // line up with faces in close-ups
    case "wide":  return 0.30;
    case "mid":
    default:      return 0.34;
  }
}

/**
 * Resolve a collision between the per-pose anchor and the subject's anchor.
 * Returns the (possibly mirrored) anchor + facing.
 *
 * Rules:
 *  - For directional reactive poses (peek/point), if our horizontal side
 *    matches the subject's side, mirror to the opposite side and flip facing.
 *  - For bottom-center poses, never mirror — return as-is (a small lateral
 *    nudge is applied later via baseLeft adjustment).
 *  - For non-reactive bottom-left/right poses, prefer the OPPOSITE side from
 *    the subject when they would otherwise collide.
 */
function resolveAnchor(
  preset: PosePreset,
  subjectAnchor: SubjectAnchor,
): { anchor: PosePreset["anchor"]; facing: 1 | -1 | null } {
  const a = preset.anchor;
  let facing = preset.facing;

  const sideOf: Record<string, "left" | "right" | "center"> = {
    "bottom-left":   "left",
    "bottom-right":  "right",
    "edge-left":     "left",
    "edge-right":    "right",
    "bottom-center": "center",
    "glide":         "center",
  };

  const ourSide = sideOf[a];
  if (ourSide === "center") return { anchor: a, facing };
  if (ourSide !== subjectAnchor) return { anchor: a, facing };

  // Collision: our side equals the subject's side. Mirror.
  const mirrorMap: Record<string, PosePreset["anchor"]> = {
    "bottom-left":  "bottom-right",
    "bottom-right": "bottom-left",
    "edge-left":    "edge-right",
    "edge-right":   "edge-left",
  };
  const mirrored = mirrorMap[a] ?? a;

  // Flip facing if it was explicit; otherwise leave null for downstream
  // default (1 = facing inward toward the subject after mirror).
  if (facing === 1) facing = -1;
  else if (facing === -1) facing = 1;

  return { anchor: mirrored, facing };
}

interface HostProps {
  voiceUrl: string;
  /** 0–1 entrance progress */
  entranceProgress: number;
  audioFrameOffset?: number;
  pharaohPose?: PharaohPose;
  sceneDurationFrames?: number;

  // ── NEW shared prop contract (all optional, safe defaults) ──
  /** How tightly the backdrop frames its subject. Drives Pharaoh size +
   *  edge-anchor vertical position. */
  sceneDensity?: SceneDensity;
  /** Where the photo's primary subject sits horizontally. Drives anchor
   *  collision avoidance. */
  subjectAnchor?: SubjectAnchor;
  /** Dominant scene color (hex). Tints contact shadow, drop shadow, and
   *  rim-light so the Pharaoh reads as IN the lighting environment. */
  sceneAmbientHex?: string;
}

export const Host: React.FC<HostProps> = ({
  voiceUrl,
  entranceProgress,
  audioFrameOffset = 0,
  pharaohPose,
  sceneDurationFrames,
  sceneDensity = "mid",
  subjectAnchor = "center",
  sceneAmbientHex,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const preset = POSE_PRESETS[pharaohPose ?? "idle-talk"];
  // Fallback ambient — brand primary will be a dark hex in most cases.
  const ambient = sceneAmbientHex ?? "#0A0A0A";

  // Idle-talk uses the two-frame mouth-swap system (or a looped WebM if one
  // has been baked via Higgsfield image-to-video). All other poses use a
  // single pose PNG / WebM (no mouth swap — the expression is baked in).
  if (!preset.src) {
    return (
      <IdleTalkHost
        voiceUrl={voiceUrl}
        entranceProgress={entranceProgress}
        audioFrameOffset={audioFrameOffset}
        frame={frame}
        fps={fps}
        width={width}
        height={height}
        sceneDensity={sceneDensity}
        subjectAnchor={subjectAnchor}
        ambient={ambient}
        videoSrc={preset.videoSrc}
      />
    );
  }

  // ── POSE MODE ───────────────────────────────────────────────────────────
  const densityMul = densityScale(sceneDensity);
  const CAPTION_RESERVED = Math.round(height * 0.165);
  // Base 0.26 (was 0.22) — gives Pharaoh more visual weight without
  // crowding the subject. With opposite-side anchor + density multiplier,
  // peak coverage is ~38% on close-ups (down from 32% before), ~29% on
  // mid scenes (was 25%), ~26% on wide (was 22%). ParallaxBackdrop's
  // densityHeightFactor was trimmed in lockstep so the photo area + this
  // Pharaoh height never sum to more than ~104% (small overlap on opposite-
  // side edge is fine since the photo subject is centered or biased away).
  const CHAR_HEIGHT = Math.round(height * 0.26 * preset.scaleMul * densityMul);
  const CHAR_WIDTH = Math.round(CHAR_HEIGHT * 0.62);

  // Resolve anchor collision with subject.
  const resolved = resolveAnchor(preset, subjectAnchor);
  const anchor = resolved.anchor;
  const facing = (resolved.facing ?? 1) as 1 | -1;

  // Position by (possibly mirrored) anchor.
  let baseLeft = 0;
  let baseBottom = CAPTION_RESERVED;
  const SIDE_MARGIN = 40;
  const edgeBottom = Math.round(height * edgeBottomFraction(sceneDensity));

  switch (anchor) {
    case "bottom-left":
      baseLeft = SIDE_MARGIN;
      break;
    case "bottom-center":
      baseLeft = (width - CHAR_WIDTH) / 2;
      // Small lateral nudge AWAY from a side-anchored subject so the Pharaoh
      // doesn't dead-stack against a face that's already biased L or R.
      if (subjectAnchor === "left") baseLeft += Math.round(width * 0.06);
      if (subjectAnchor === "right") baseLeft -= Math.round(width * 0.06);
      break;
    case "bottom-right":
      baseLeft = width - CHAR_WIDTH - SIDE_MARGIN;
      break;
    case "edge-left":
      baseLeft = -CHAR_WIDTH * 0.15;
      baseBottom = edgeBottom;
      break;
    case "edge-right":
      baseLeft = width - CHAR_WIDTH * 0.85;
      baseBottom = edgeBottom;
      break;
    default:
      baseLeft = SIDE_MARGIN;
  }

  // ── Entry animation deltas ──────────────────────────────────────────────
  let entryX = 0;
  let entryY = 0;
  let entryScale = 1;
  let entryOpacity = 1;

  const entrySpring = spring({
    fps,
    frame,
    config: { damping: 14, stiffness: 100 },
    durationInFrames: 22,
  });

  switch (preset.animation) {
    case "slide-from-left":
      // After mirror, if anchor flipped to edge-right we still slide from
      // the side the art faces away from — use the resolved anchor's edge.
      entryX = interpolate(
        entrySpring,
        [0, 1],
        anchor === "edge-right" ? [CHAR_WIDTH, 0] : [-CHAR_WIDTH, 0],
      );
      entryOpacity = interpolate(entrySpring, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });
      break;
    case "slide-from-right":
      entryX = interpolate(
        entrySpring,
        [0, 1],
        anchor === "edge-left" ? [-CHAR_WIDTH, 0] : [CHAR_WIDTH, 0],
      );
      entryOpacity = interpolate(entrySpring, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });
      break;
    case "fade-in":
      entryOpacity = interpolate(entrySpring, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
      break;
    case "scale-pop":
      entryScale = entrySpring;
      entryOpacity = interpolate(entrySpring, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });
      break;
    case "walk-from-left": {
      const walkDur = fps * 1.0;
      const walkP = interpolateClamp(frame, 0, walkDur, 0, 1);
      entryX = interpolate(walkP, [0, 1], [-CHAR_WIDTH - 60, 0]);
      entryOpacity = interpolate(walkP, [0, 0.2], [0, 1], { extrapolateRight: "clamp" });
      entryY = -Math.abs(Math.sin((frame / (fps * 0.32)) * Math.PI)) * 7;
      break;
    }
    case "walk-out-right": {
      const exitStart = Math.max(0, (sceneDurationFrames ?? fps * 8) - fps * 1.2);
      const exitDur = fps * 1.2;
      const exitP = interpolateClamp(frame, exitStart, exitStart + exitDur, 0, 1);
      entryX = interpolate(exitP, [0, 1], [0, CHAR_WIDTH + 80]);
      entryOpacity = interpolate(exitP, [0.7, 1], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      entryY = -Math.abs(Math.sin((frame / (fps * 0.32)) * Math.PI)) * 7;
      break;
    }
  }

  // ── Continuous reactive idle (alive even when "static") ─────────────────
  // 1) Breath bob — gentle 1.6 Hz sine.
  const breathBob = Math.sin((frame / fps) * 1.6 * Math.PI) * 2.4;

  // 2) Settle bounce — secondary spring fires ~7 frames after entry, gives a
  //    small head-cock + rebound so the entry doesn't end flat.
  const settleSpring = spring({
    fps,
    frame: Math.max(0, frame - 7),
    config: { damping: 8, stiffness: 180 },
    durationInFrames: 14,
  });
  // Decay envelope so settle dies off after ~24 frames.
  const settleEnv = interpolate(frame, [7, 30], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const settleY = -interpolate(settleSpring, [0, 1], [0, 4]) * settleEnv;
  const settleRot = interpolate(settleSpring, [0, 1], [0, 2.2]) * settleEnv;

  // 3) Micro-blink — every ~5s (140 frames), a brief 4-frame opacity dip.
  //    Phased so different scenes don't blink in lockstep.
  const blinkPeriod = 140;
  const blinkPhase = frame % blinkPeriod;
  const blinkOpacity = blinkPhase < 4
    ? interpolate(blinkPhase, [0, 1, 3, 4], [1, 0.55, 0.55, 1])
    : 1;

  // ── Shadow / lighting integration ───────────────────────────────────────
  // Layered drop-shadow: ambient-tinted ground shadow + cool rim accent.
  // Two stacked drop-shadow filters compose on the GPU — cheap.
  const shadowFilter =
    `drop-shadow(0 14px 14px ${rgba(ambient, 0.55)}) ` +
    `drop-shadow(0 2px 0 ${rgba(ambient, 0.35)})`;

  // Contact shadow at the feet — radial gradient sibling, NOT mirrored.
  const contactShadowWidth = Math.round(CHAR_WIDTH * 1.15);
  const contactShadowHeight = Math.round(CHAR_HEIGHT * 0.09);

  return (
    <div
      style={{
        position: "absolute",
        bottom: baseBottom,
        left: baseLeft,
        width: CHAR_WIDTH,
        height: CHAR_HEIGHT,
        // Parent wrapper carries position + entry transforms only — NOT
        // the mirror, so the contact-shadow div below stays correctly oriented.
        transform: [
          `translateX(${entryX}px)`,
          `translateY(${entryY + breathBob + settleY}px)`,
          `scale(${entryScale})`,
        ].join(" "),
        transformOrigin: "bottom center",
        opacity: entryOpacity * blinkOpacity,
      }}
    >
      {/* Contact shadow — radial-gradient pseudo-floor at the feet, tinted
          by sceneAmbientHex. Sits BEHIND the sprite, NOT mirrored, scales
          slightly with breath so it feels like weight transfers. */}
      <div
        style={{
          position: "absolute",
          left: (CHAR_WIDTH - contactShadowWidth) / 2,
          bottom: -Math.round(contactShadowHeight * 0.35),
          width: contactShadowWidth,
          height: contactShadowHeight,
          background: `radial-gradient(ellipse at center, ${rgba(ambient, 0.6)} 0%, ${rgba(ambient, 0.25)} 40%, ${rgba(ambient, 0)} 70%)`,
          // Breath compresses the shadow slightly when Pharaoh "rises".
          transform: `scaleX(${1 - breathBob * 0.02}) scaleY(${1 + breathBob * 0.015})`,
          transformOrigin: "center",
          filter: "blur(1px)",
          pointerEvents: "none",
        }}
      />
      {/* Sprite wrapper — owns the mirror so shadows don't flip. Also
          carries the settle head-cock rotation. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `rotate(${settleRot}deg) scaleX(${facing})`,
          transformOrigin: "bottom center",
          filter: shadowFilter,
        }}
      >
        {preset.videoSrc ? (
          // Pre-keyed WebM with alpha — skip WhiteKeyImage (already transparent).
          // muted because pose clips are decorative; the only audio is the
          // narrator's TTS playing in the parent composition.
          <OffthreadVideo
            src={preset.videoSrc}
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
        ) : (
          <WhiteKeyImage
            src={preset.src!}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "bottom center",
            }}
          />
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// IdleTalkHost — the original two-frame audio-driven Pharaoh, now also
// scene-aware (sizing, ambient shadow) and with micro-blinks.
// ─────────────────────────────────────────────────────────────────────────────
interface IdleTalkHostProps {
  voiceUrl: string;
  entranceProgress: number;
  audioFrameOffset: number;
  frame: number;
  fps: number;
  width: number;
  height: number;
  sceneDensity: SceneDensity;
  subjectAnchor: SubjectAnchor;
  ambient: string;
  /** When set, replaces the two-frame mouth-swap with a looped pre-keyed
   *  WebM (Higgsfield image-to-video). Mouth-open/closed swap is skipped —
   *  the WebM's natural motion stands in for it. Audio-driven body bob is
   *  also disabled because the WebM already has subtle in-baked motion. */
  videoSrc?: string;
}

const IdleTalkHost: React.FC<IdleTalkHostProps> = ({
  voiceUrl,
  entranceProgress,
  audioFrameOffset,
  frame,
  fps,
  width,
  height,
  sceneDensity,
  subjectAnchor,
  ambient,
  videoSrc,
}) => {
  const absoluteFrame = frame + audioFrameOffset;
  const audioData = useAudioData(voiceUrl);

  const speechEnergy: number = useMemo(() => {
    if (!audioData) return 0;
    const amplitudes = visualizeAudio({
      fps,
      frame: absoluteFrame,
      audioData,
      numberOfSamples: 32,
    });
    const speechBins = amplitudes.slice(4, 20);
    return speechBins.reduce((a, b) => a + b, 0) / speechBins.length;
  }, [audioData, absoluteFrame, fps]);

  // Scene-aware sizing for idle-talk too — a close-up scene shouldn't shrink
  // the talking head into a sticker.
  const densityMul = densityScale(sceneDensity);
  const CAPTION_RESERVED = Math.round(height * 0.165);
  const CHAR_HEIGHT = Math.round(height * 0.26 * densityMul);
  const CHAR_WIDTH = Math.round(CHAR_HEIGHT * 0.62);

  const SIDE_MARGIN = 40;

  // Glide bounds — if subject is biased L or R, tighten the glide so the
  // talker doesn't sit on top of the face.
  let glideMin = SIDE_MARGIN;
  let glideMax = width - CHAR_WIDTH - SIDE_MARGIN;
  if (subjectAnchor === "left") {
    glideMin = Math.round(width * 0.35);
  } else if (subjectAnchor === "right") {
    glideMax = Math.round(width * 0.65) - CHAR_WIDTH;
  }
  // Guard against degenerate range if density made the Pharaoh wider than
  // the remaining glide window.
  if (glideMax < glideMin) {
    const mid = (glideMin + glideMax) / 2;
    glideMin = mid;
    glideMax = mid;
  }

  const glidePeriod = fps * 14;
  const glidePhase = Math.sin((absoluteFrame / glidePeriod) * 2 * Math.PI);
  const glideX = interpolate(glidePhase, [-1, 1], [glideMin, glideMax]);

  const movingRight =
    Math.cos((absoluteFrame / glidePeriod) * 2 * Math.PI) >= 0;
  const facing = movingRight ? 1 : -1;

  const stepPeriod = fps * 0.62;
  const stepPhase = (absoluteFrame / stepPeriod) * 2 * Math.PI;
  const walkBob = -Math.abs(Math.sin(stepPhase)) * 9;
  const walkRock = Math.sin(stepPhase) * 2.2;

  const slideY = interpolate(entranceProgress, [0, 1], [120, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(entranceProgress, [0, 0.4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Audio-energy bob — allowed here because lip-sync silhouette is meant to
  // pulse with speech. Pose mode intentionally skips this. ALSO skipped when
  // videoSrc is set — the baked-in WebM motion would compound and feel jittery.
  const speechBob = videoSrc ? 0 : -Math.min(speechEnergy, 0.6) * 6;
  const mouthOpen = speechEnergy >= 0.13;

  // Micro-blink — same 140-frame cadence as pose mode.
  const blinkPhase = frame % 140;
  const blinkOpacity = blinkPhase < 4
    ? interpolate(blinkPhase, [0, 1, 3, 4], [1, 0.55, 0.55, 1])
    : 1;

  const frameImgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: "bottom center",
  };

  // Same layered shadow strategy as pose mode.
  const shadowFilter =
    `drop-shadow(0 14px 14px ${rgba(ambient, 0.55)}) ` +
    `drop-shadow(0 2px 0 ${rgba(ambient, 0.35)})`;
  const contactShadowWidth = Math.round(CHAR_WIDTH * 1.15);
  const contactShadowHeight = Math.round(CHAR_HEIGHT * 0.09);

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
        ].join(" "),
        transformOrigin: "bottom center",
        opacity: opacity * blinkOpacity,
      }}
    >
      {/* Contact shadow — same recipe as pose mode, not mirrored. */}
      <div
        style={{
          position: "absolute",
          left: (CHAR_WIDTH - contactShadowWidth) / 2,
          bottom: -Math.round(contactShadowHeight * 0.35),
          width: contactShadowWidth,
          height: contactShadowHeight,
          background: `radial-gradient(ellipse at center, ${rgba(ambient, 0.6)} 0%, ${rgba(ambient, 0.25)} 40%, ${rgba(ambient, 0)} 70%)`,
          filter: "blur(1px)",
          pointerEvents: "none",
        }}
      />
      {/* Sprite wrapper — carries mirror + rock so the shadow stays put. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `rotate(${walkRock}deg) scaleX(${facing})`,
          transformOrigin: "bottom center",
          filter: shadowFilter,
        }}
      >
        {videoSrc ? (
          // Looped pre-keyed WebM with alpha — the natural in-baked motion
          // (breath, head tilt, blinks) replaces the binary mouth-swap.
          <OffthreadVideo
            src={videoSrc}
            loop
            muted
            style={frameImgStyle}
          />
        ) : (
          <>
            <WhiteKeyImage
              src={PHARAOH_CLOSED}
              style={{ ...frameImgStyle, opacity: mouthOpen ? 0 : 1 }}
            />
            <WhiteKeyImage
              src={PHARAOH_OPEN}
              style={{ ...frameImgStyle, opacity: mouthOpen ? 1 : 0 }}
            />
          </>
        )}
      </div>
    </div>
  );
};
