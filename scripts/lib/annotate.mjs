#!/usr/bin/env node
// annotate.mjs — draws ONE rounded highlight box + numbered badge onto a COPY
// of a screenshot at a recorded bounding box (M21 user-guide capture
// pipeline). The original file/buffer is never touched — this always
// produces a new image.
//
// Scope note: exactly one annotation per call, per the ticket. A future
// ticket can extend this to multi-annotation composites if ever needed;
// building that here would be over-scope.
//
// CLI:
//   node annotate.mjs <input> <output> --x <n> --y <n> --width <n> --height <n> [--number <n>] [--color <#hex>]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const DEFAULT_OPTIONS = {
  number: 1,
  color: '#FF3366',
  strokeWidth: 4,
  cornerRadius: 10,
  badgeRadius: 15,
  badgeFontSize: 18,
};

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// Badge sits at the highlight box's top-left corner by default, nudged
// inward (collision-aware) so it never gets clipped off the image edge.
//
// The clamp range is [marginX, imgWidth - marginX] with marginX capped at
// imgWidth/2 (and same for Y) so the lower bound never exceeds the upper
// bound — for very small images (below Gate A's 200x200 size floor, so not
// reachable via the documented capture pipeline) this centers the badge
// rather than collapsing the range to a single point past the edge, which
// is what the naive `Math.max(imgWidth - margin, margin)` form did.
export function badgeCenter(box, imgWidth, imgHeight, { badgeRadius, strokeWidth }) {
  const margin = badgeRadius + strokeWidth;
  const marginX = Math.min(margin, imgWidth / 2);
  const marginY = Math.min(margin, imgHeight / 2);
  const x = Math.min(Math.max(box.x, marginX), imgWidth - marginX);
  const y = Math.min(Math.max(box.y, marginY), imgHeight - marginY);
  return { x, y };
}

function buildOverlaySvg(box, imgWidth, imgHeight, options) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { color, strokeWidth, cornerRadius, badgeRadius, badgeFontSize, number } = opts;

  // Keep the highlight rect fully inside the canvas even if the recorded
  // box sits flush against an edge (stroke would otherwise be clipped).
  const half = strokeWidth / 2;
  const rectX = Math.max(half, box.x);
  const rectY = Math.max(half, box.y);
  const rectW = Math.min(box.width, imgWidth - rectX - half);
  const rectH = Math.min(box.height, imgHeight - rectY - half);

  const badge = badgeCenter(box, imgWidth, imgHeight, opts);

  return `<svg width="${imgWidth}" height="${imgHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" rx="${cornerRadius}" ry="${cornerRadius}"
        fill="none" stroke="${escapeXml(color)}" stroke-width="${strokeWidth}" />
  <circle cx="${badge.x}" cy="${badge.y}" r="${badgeRadius}" fill="${escapeXml(color)}" stroke="white" stroke-width="2" />
  <text x="${badge.x}" y="${badge.y}" font-family="sans-serif" font-size="${badgeFontSize}" font-weight="bold"
        fill="white" text-anchor="middle" dominant-baseline="central">${escapeXml(number)}</text>
</svg>`;
}

function validateBoundingBox(box) {
  for (const key of ['x', 'y', 'width', 'height']) {
    if (typeof box?.[key] !== 'number' || !Number.isFinite(box[key])) {
      throw new Error(`annotate: boundingBox.${key} must be a finite number`);
    }
  }
  if (box.width <= 0 || box.height <= 0) {
    throw new Error('annotate: boundingBox.width and boundingBox.height must be > 0');
  }
}

// Reads `input` (path or Buffer — read-only, never mutated) and returns a
// NEW Buffer with the annotation composited on. Does not touch disk unless
// `outputPath` is given.
export async function annotate(input, boundingBox, options = {}) {
  validateBoundingBox(boundingBox);
  const sourceBuffer = Buffer.isBuffer(input) ? input : readFileSync(input);
  const metadata = await sharp(sourceBuffer).metadata();
  const svg = buildOverlaySvg(boundingBox, metadata.width, metadata.height, options);
  const outBuffer = await sharp(sourceBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
  return outBuffer;
}

// Convenience wrapper: writes the annotated copy to `outputPath`. Refuses to
// write to the same resolved path as `inputPath` — annotate.mjs must never
// overwrite the source capture.
export async function annotateToFile(inputPath, outputPath, boundingBox, options = {}) {
  if (resolve(inputPath) === resolve(outputPath)) {
    throw new Error('annotate: outputPath must differ from inputPath — the original must be kept clean');
  }
  const outBuffer = await annotate(inputPath, boundingBox, options);
  writeFileSync(outputPath, outBuffer);
  return outputPath;
}

// ── CLI ──────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  // Rejects a value that looks like another flag (e.g. `--color --number 7`)
  // instead of silently swallowing it as `--color`'s value.
  const flag = (name) => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      console.error(`annotate.mjs: ${name} requires a value`);
      process.exit(2);
    }
    return value;
  };
  const [input, output] = argv;

  if (!input || !output || input.startsWith('--') || output.startsWith('--')) {
    console.error(
      'usage: annotate.mjs <input> <output> --x <n> --y <n> --width <n> --height <n> [--number <n>] [--color <#hex>]'
    );
    process.exit(2);
  }
  const boundingBox = {
    x: Number(flag('--x')),
    y: Number(flag('--y')),
    width: Number(flag('--width')),
    height: Number(flag('--height')),
  };
  const options = {};
  if (flag('--number') != null) options.number = Number(flag('--number'));
  if (flag('--color') != null) options.color = flag('--color');

  await annotateToFile(input, output, boundingBox, options);
  console.log(`annotated copy written to ${output}`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch((err) => {
    // A clean message, not a full stack trace — this is meant to be
    // machine-readable by a calling agent, not just human-debugged.
    console.error(`annotate.mjs: ${err.message}`);
    process.exit(1);
  });
}
