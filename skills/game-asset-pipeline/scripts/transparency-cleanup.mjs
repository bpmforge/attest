#!/usr/bin/env node
// transparency-cleanup.mjs — post-process step of the M9 game-asset-pipeline
// (T9.5). Gen-model sprite output typically arrives with a matte/background
// still baked into the edge pixels: a ring of partially-transparent pixels
// whose RGB is contaminated with the generation background color (usually
// white or a solid matte), because the source renderer alpha-blended the
// sprite over that background before the alpha channel was cut in. Naively
// keeping those pixels ships a visible light/dark halo around every sprite
// once it's composited onto a game background that isn't the same color.
//
// This does two decisions per pixel, driven purely by alpha + color distance
// to a known (or auto-detected) background color — no ML, fully
// deterministic:
//   1. thresholds: alpha below `lowAlpha` -> fully transparent (0); alpha
//      above `highAlpha` -> fully opaque (255); the band between is "fringe".
//   2. fringe pixels close to the background color get killed (alpha 0);
//      fringe pixels far from the background color are real sprite edge —
//      snapped opaque AND un-premultiplied to strip the background bleed
//      from their RGB (standard alpha-matting cleanup:
//      real = (observed - bg*(1-a)) / a, clamped to [0,255]).
//
// CLI:
//   node transparency-cleanup.mjs <input> [--bg r,g,b | --auto-bg]
//                                  [--low <0-255>] [--high <0-255>]
//                                  [--out <file>] [--json]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const DEFAULTS = { lowAlpha: 32, highAlpha: 224 };

export async function loadRawRGBA(input) {
  const image = sharp(Buffer.isBuffer(input) ? input : readFileSync(input));
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

// Samples the four corner pixels and averages them — a cheap, deterministic
// background estimate that works whenever the generation matte fills the
// image's outer edge (true for every sprite-on-a-flat-background gen this
// step targets). Explicit `--bg` always wins over this.
export function detectBackground(raw) {
  const { data, width, height, channels } = raw;
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const sums = [0, 0, 0];
  for (const [x, y] of corners) {
    const base = (y * width + x) * channels;
    sums[0] += data[base];
    sums[1] += data[base + 1];
    sums[2] += data[base + 2];
  }
  return sums.map((s) => Math.round(s / corners.length));
}

function colorDistance(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// Un-premultiplies a fringe pixel against the background, recovering the
// sprite's true edge color instead of the background-blended one. `a` is the
// pixel's OWN alpha in [0,1] after thresholding decisions are made
// upstream — this only fires for pixels being kept as opaque edge.
export function unPremultiply(observed, bg, alpha01) {
  if (alpha01 <= 0) return [0, 0, 0];
  return observed.map((c, i) => {
    const real = (c - bg[i] * (1 - alpha01)) / alpha01;
    return Math.max(0, Math.min(255, Math.round(real)));
  });
}

// bgDistanceTolerance: fringe pixels within this Euclidean RGB distance of
// the background are treated as background bleed (killed); farther pixels
// are treated as real, partially-covered sprite edge (kept + de-fringed).
export function cleanTransparency(raw, options = {}) {
  const { lowAlpha = DEFAULTS.lowAlpha, highAlpha = DEFAULTS.highAlpha, bgDistanceTolerance = 60 } = options;
  const bg = options.bg ?? detectBackground(raw);
  const { data, width, height, channels } = raw;
  const n = width * height;
  const out = Buffer.alloc(n * 4);
  let killed = 0;
  let deFringed = 0;
  let untouched = 0;

  for (let i = 0; i < n; i++) {
    const base = i * channels;
    const outBase = i * 4;
    const r = data[base];
    const g = data[base + 1];
    const b = data[base + 2];
    const a = channels > 3 ? data[base + 3] : 255;

    if (a <= lowAlpha) {
      out[outBase + 3] = 0;
      killed++;
      continue;
    }
    if (a >= highAlpha) {
      out[outBase] = r;
      out[outBase + 1] = g;
      out[outBase + 2] = b;
      out[outBase + 3] = 255;
      untouched++;
      continue;
    }

    // fringe band
    const dist = colorDistance([r, g, b], bg);
    if (dist <= bgDistanceTolerance) {
      out[outBase + 3] = 0;
      killed++;
    } else {
      const [rr, rg, rb] = unPremultiply([r, g, b], bg, a / 255);
      out[outBase] = rr;
      out[outBase + 1] = rg;
      out[outBase + 2] = rb;
      out[outBase + 3] = 255;
      deFringed++;
    }
  }

  return { data: out, width, height, channels: 4, bg, stats: { killed, deFringed, untouched, total: n } };
}

export async function runTransparencyCleanup(input, options = {}) {
  const raw = await loadRawRGBA(input);
  return cleanTransparency(raw, options);
}

export async function rgbaToPngBuffer(rgba) {
  return sharp(rgba.data, { raw: { width: rgba.width, height: rgba.height, channels: 4 } }).png().toBuffer();
}

// ── CLI ──────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      console.error(`transparency-cleanup.mjs: ${name} requires a value`);
      process.exit(2);
    }
    return value;
  };

  const input = argv[0];
  if (!input || input.startsWith('--')) {
    console.error('usage: transparency-cleanup.mjs <input> [--bg r,g,b] [--low <0-255>] [--high <0-255>] [--out <file>] [--json]');
    process.exit(2);
  }
  const bgArg = flag('--bg');
  const bg = bgArg ? bgArg.split(',').map(Number) : undefined;
  const lowAlpha = flag('--low') ? Number(flag('--low')) : undefined;
  const highAlpha = flag('--high') ? Number(flag('--high')) : undefined;
  const out = flag('--out') ?? input.replace(/\.png$/i, '') + '.cleaned.png';

  const result = await runTransparencyCleanup(input, { bg, lowAlpha, highAlpha });
  const png = await rgbaToPngBuffer(result);
  writeFileSync(out, png);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ out, bg: result.bg, stats: result.stats }, null, 2));
  } else {
    console.log(
      `transparency-cleanup: bg=rgb(${result.bg.join(',')}) killed=${result.stats.killed} de-fringed=${result.stats.deFringed} kept=${result.stats.untouched} -> ${out}`
    );
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch((err) => {
    console.error(`transparency-cleanup.mjs: ${err.message}`);
    process.exit(1);
  });
}
