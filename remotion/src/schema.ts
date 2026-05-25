import { z } from "zod";

export const KenBurnsSchema = z.object({
  from: z
    .number()
    .min(0.5)
    .max(2)
    .default(1.0)
    .describe("Scale at segment start (1.0 = no zoom)"),
  to: z
    .number()
    .min(0.5)
    .max(2)
    .default(1.15)
    .describe("Scale at segment end"),
});

export const PharaohPoseEnum = z.enum([
  "idle-talk",
  "peek-left",
  "peek-right",
  "point-up-right",
  "point-down",
  "surprised",
  "sarcastic-shrug",
  "count-fingers",
  "walk-in-left",
  "walk-out-right",
  "crying",
  "celebrating",
]);

export const SegmentSchema = z.object({
  text_ar: z
    .string()
    .describe("Colloquial Egyptian Arabic caption/narration line"),
  visual_url: z
    .string()
    .describe("Image URL for this segment's backdrop"),
  audio_url: z
    .string()
    .optional()
    .describe(
      "URL to this segment's individual TTS MP3. When provided, this audio " +
      "plays only during this segment's frames — the segment's duration_ms " +
      "is set to the actual MP3 length by the upstream pipeline, so visual " +
      "and audio stay perfectly synced. When omitted, host_voice_url is " +
      "expected to be the full-video narration (legacy mode)."
    ),
  duration_ms: z
    .number()
    .min(1000)
    .max(30000)
    .describe("Segment duration in milliseconds (6000–12000 typical)"),
  ken_burns: KenBurnsSchema.optional().describe(
    "Ken Burns zoom effect on backdrop"
  ),
  pharaoh_pose: PharaohPoseEnum.optional().describe(
    "Optional Pharaoh pose for this segment. When omitted (or 'idle-talk'), " +
    "the default audio-driven mouth-swap talking Pharaoh is rendered. Other " +
    "values render the matching pose PNG from public/poses/ with its own " +
    "entry animation — peek-left/peek-right enter from edges, walk-in-left " +
    "walks across, point-up-right points at the photo, etc."
  ),
});

export const BrandSchema = z.object({
  primary: z.string().describe("Primary brand colour (hex, e.g. #0A0A0A)"),
  accent: z.string().describe("Accent brand colour (hex, e.g. #D4AF37)"),
  logo_url: z.string().describe("URL or staticFile path to the brand logo"),
});

export const NewsRoundupSchema = z.object({
  host_voice_url: z
    .string()
    .describe(
      "URL or local path to the ElevenLabs MP3 narration for the full video"
    ),
  segments: z
    .array(SegmentSchema)
    .min(1)
    .max(20)
    .describe("Ordered list of news segments"),
  brand: BrandSchema,
  intro_text: z
    .string()
    .describe("Headline shown on the intro card (Arabic or bilingual)"),
  outro_handle: z
    .string()
    .describe("Social handle shown on the outro card, e.g. @HonestStack"),
  days_to_wc: z
    .number()
    .int()
    .min(0)
    .max(999)
    .optional()
    .describe(
      "Days remaining until World Cup 2026 kickoff (June 11, 2026). " +
      "When > 0, a countdown chip renders top-right on every scene. " +
      "0 means the tournament has started (chip hides)."
    ),
});

export type KenBurns = z.infer<typeof KenBurnsSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type NewsRoundupProps = z.infer<typeof NewsRoundupSchema>;
