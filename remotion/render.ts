/**
 * HonestStack World Cup — Remotion CLI renderer
 *
 * Usage:
 *   npx tsx render.ts <path-to-props.json> [output-filename.mp4]
 *
 * Example:
 *   npx tsx render.ts sample-props.json out/worldcup-ep1.mp4
 *
 * The props file must match the NewsRoundupSchema (see src/schema.ts).
 */

import path from "path";
import fs from "fs";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { NewsRoundupSchema } from "./src/schema";

async function main() {
  const args = process.argv.slice(2);
  const propsFilePath = args[0];
  const outputFileName = args[1] ?? `out/worldcup-${Date.now()}.mp4`;

  if (!propsFilePath) {
    console.error(
      "Usage: npx tsx render.ts <path-to-props.json> [output.mp4]"
    );
    process.exit(1);
  }

  const absolutePropsPath = path.resolve(propsFilePath);
  if (!fs.existsSync(absolutePropsPath)) {
    console.error(`Props file not found: ${absolutePropsPath}`);
    process.exit(1);
  }

  // Parse and validate props via zod
  const rawProps = JSON.parse(fs.readFileSync(absolutePropsPath, "utf-8"));
  const parseResult = NewsRoundupSchema.safeParse(rawProps);
  if (!parseResult.success) {
    console.error("Invalid props:", parseResult.error.format());
    process.exit(1);
  }
  const inputProps = parseResult.data;

  // Ensure output directory exists
  const outputPath = path.resolve(outputFileName);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log("🎬 Bundling Remotion project...");
  const bundleLocation = await bundle({
    entryPoint: path.resolve("src/index.ts"),
    // Pass webpack overrides if needed (none required here)
    webpackOverride: (config) => config,
  });

  console.log("📋 Selecting composition: NewsRoundup");
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "NewsRoundup",
    inputProps,
  });

  console.log(
    `🎥 Rendering ${composition.durationInFrames} frames at ${composition.fps}fps…`
  );
  console.log(
    `   Duration: ${(composition.durationInFrames / composition.fps).toFixed(1)}s`
  );
  console.log(`   Output:   ${outputPath}`);

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    // Progress reporting
    onProgress: ({ renderedFrames, encodedFrames, stitchStage }) => {
      if (renderedFrames % 30 === 0) {
        const pct = (
          (renderedFrames / composition.durationInFrames) *
          100
        ).toFixed(0);
        process.stdout.write(
          `\r  Rendering: ${renderedFrames}/${composition.durationInFrames} frames (${pct}%) | encoding: ${encodedFrames}`
        );
      }
    },
    chromiumOptions: {
      gl: "angle",
    },
  });

  console.log(`\n✅ Done! Video saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});
