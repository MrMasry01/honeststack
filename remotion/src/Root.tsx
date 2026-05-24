import React from "react";
import { Composition } from "remotion";
import { NewsRoundup } from "./NewsRoundup";
import { NewsRoundupSchema } from "./schema";
import type { NewsRoundupProps } from "./schema";

const FPS = 30;
// Back to 1080x1920 portrait after the Railway plan upgrade.
// Previous OOM-kills at 1080p (libx264 lookahead + reference frames
// holding ~30 raw 1080x1920x4-byte frames = ~250MB in encoder memory
// alone) are no longer a concern with the higher-memory plan.
// Each Remotion component still uses proportional sizing (driven from
// useVideoConfig().height) so they scale correctly at any resolution.
const WIDTH = 1080;
const HEIGHT = 1920;

/**
 * Calculates the total frame count from the segments' duration_ms values
 * plus a fixed 90-frame intro and 90-frame outro.
 */
export const calculateNewsRoundupMetadata = async ({
  props,
}: {
  props: NewsRoundupProps;
}) => {
  const INTRO_FRAMES = 90; // 3 s
  const OUTRO_FRAMES = 90; // 3 s
  const segmentFrames = props.segments.reduce((sum, seg) => {
    return sum + Math.round((seg.duration_ms / 1000) * FPS);
  }, 0);

  return {
    durationInFrames: INTRO_FRAMES + segmentFrames + OUTRO_FRAMES,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
  };
};

const defaultProps: NewsRoundupProps = {
  host_voice_url:
    "https://example.com/placeholder-narration.mp3",
  // The host is the fixed Egyptian Pharaoh mascot, bundled with the project
  // (public/pharaoh-*.png) — it is identical in every video, so there is no
  // per-video character prop.
  segments: [
    {
      text_ar: "مصر تستعد للمونديال! الأهلاوية والزملكاوية كلهم جاهزين.",
      visual_url: "https://images.pexels.com/photos/46798/the-ball-stadion-football-the-pitch-46798.jpeg",
      duration_ms: 8000,
      ken_burns: { from: 1.0, to: 1.12 },
    },
  ],
  brand: {
    primary: "#0A0A0A",
    accent: "#D4AF37",
    logo_url: "https://example.com/honeststack-logo.png",
  },
  intro_text: "أخبار كأس العالم 2026",
  outro_handle: "@HonestStack",
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="NewsRoundup"
      component={NewsRoundup}
      schema={NewsRoundupSchema}
      defaultProps={defaultProps}
      calculateMetadata={calculateNewsRoundupMetadata}
      // These are overridden by calculateMetadata at render time
      durationInFrames={270}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
