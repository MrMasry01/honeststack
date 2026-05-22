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

export const SegmentSchema = z.object({
  text_ar: z
    .string()
    .describe("Colloquial Egyptian Arabic caption/narration line"),
  visual_url: z
    .string()
    .describe("Image URL for this segment's backdrop"),
  duration_ms: z
    .number()
    .min(1000)
    .max(30000)
    .describe("Segment duration in milliseconds (6000–12000 typical)"),
  ken_burns: KenBurnsSchema.optional().describe(
    "Ken Burns zoom effect on backdrop"
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
});

export type KenBurns = z.infer<typeof KenBurnsSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type NewsRoundupProps = z.infer<typeof NewsRoundupSchema>;
