#!/usr/bin/env node
// pixel-snap.mjs — the "lattice/pixel-snapper" post-process step of the M9
// game-asset-pipeline (T9.5). Diffusion/gen-model output that is supposed to
// read as pixel art is almost never actually on a clean pixel grid: edges are
// anti-aliased, flat regions carry low-amplitude gradient noise, and colors
// drift pixel-to-pixel where a hand-authored sprite would hold one flat
// value. This snaps the image onto an explicit N x M lattice by taking the
// DOMINANT color of each cell (not an average, which re-blurs exactly the
// noise this exists to remove) and optionally quantizes the result to a
// fixed-size palette.
//
// CLI:
//   node pixel-snap.mjs <input> --grid <cols>x<rows> [--palette <N>]
//                        [--upscale <N>] [--out <file>] [--json]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// ── raw pixel I/O ────────────────────────────────────────────────────────

export async function loadRawRGBA(input) {
  const image = sharp(Buffer.isBuffer(input) ? input : readFileSync(input));
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

// ── lattice snap ─────────────────────────────────────────────────────────

// Dominant RGBA color of one cell region, via quantized-bucket voting.
// Alpha is folded into the bucket key so a half-transparent edge pixel never
// gets averaged into a fully-opaque body color (or vice versa) — the two
// populations must compete as distinct buckets.
export function cellDominantColor(raw, x0, y0, cellW, cellH, { binSize = 16 } = {}) {
  const { data, width, height, channels } = raw;
  const x1 = Math.min(x0 + cellW, width);
  const y1 = Math.min(y0 + cellH, height);
  const counts = new Map();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const base = (y * width + x) * channels;
      const r = data[base] - (data[base] % binSize);
      const g = data[base + 1] - (data[base + 1] % binSize);
      const b = data[base + 2] - (data[base + 2] % binSize);
      const a = channels > 3 ? data[base + 3] - (data[base + 3] % binSize) : 255;
      const key = (r << 24) | (g << 16) | (b << 8) | a;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  let bestKey = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return [(bestKey >>> 24) & 0xff, (bestKey >>> 16) & 0xff, (bestKey >>> 8) & 0xff, bestKey & 0xff];
}

// Snaps a raw RGBA buffer onto a gridWidth x gridHeight lattice. Cell
// boundaries are computed from float division so the source is covered
// edge-to-edge even when it doesn't divide evenly by the grid size.
export function snapToGrid(raw, gridWidth, gridHeight, options = {}) {
  const out = Buffer.alloc(gridWidth * gridHeight * 4);
  const cellW = raw.width / gridWidth;
  const cellH = raw.height / gridHeight;
  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const x0 = Math.floor(gx * cellW);
      const y0 = Math.floor(gy * cellH);
      const w = Math.max(1, Math.round(cellW));
      const h = Math.max(1, Math.round(cellH));
      const [r, g, b, a] = cellDominantColor(raw, x0, y0, w, h, options);
      const base = (gy * gridWidth + gx) * 4;
      out[base] = r;
      out[base + 1] = g;
      out[base + 2] = b;
      out[base + 3] = a;
    }
  }
  return { data: out, width: gridWidth, height: gridHeight, channels: 4 };
}

// ── palette quantization (optional) ─────────────────────────────────────

function colorDistance(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 + (a[3] - b[3]) ** 2;
}

// Reduces a snapped grid to at most `size` colors: the top-`size` most
// frequent exact colors become the palette, every other pixel maps to its
// nearest palette entry by RGBA distance. Fully-transparent pixels (alpha 0)
// always map to a dedicated transparent palette entry, never blended into a
// visible color, since alpha 0 pixels carry no meaningful RGB.
export function quantizePalette(grid, size) {
  if (size <= 0) return grid;
  const { data, width, height } = grid;
  const n = width * height;
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const base = i * 4;
    if (data[base + 3] === 0) continue; // transparent pixels don't vote for a color
    const key = (data[base] << 24) | (data[base + 1] << 16) | (data[base + 2] << 8) | data[base + 3];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, size);
  const palette = ranked.map(([key]) => [(key >>> 24) & 0xff, (key >>> 16) & 0xff, (key >>> 8) & 0xff, key & 0xff]);
  if (palette.length === 0) return grid;

  const out = Buffer.alloc(data.length);
  for (let i = 0; i < n; i++) {
    const base = i * 4;
    if (data[base + 3] === 0) {
      out[base + 3] = 0;
      continue;
    }
    const px = [data[base], data[base + 1], data[base + 2], data[base + 3]];
    let best = palette[0];
    let bestDist = Infinity;
    for (const candidate of palette) {
      const d = colorDistance(px, candidate);
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
    out[base] = best[0];
    out[base + 1] = best[1];
    out[base + 2] = best[2];
    out[base + 3] = best[3];
  }
  return { data: out, width, height, channels: 4 };
}

// Nearest-neighbor upscale — the only correct upscale for pixel art; any
// filtered resize would reintroduce the softness this pipeline exists to
// remove.
export function nearestUpscale(grid, scale) {
  const { data, width, height } = grid;
  const outW = width * scale;
  const outH = height * scale;
  const out = Buffer.alloc(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < outW; x++) {
      const sx = Math.floor(x / scale);
      const srcBase = (sy * width + sx) * 4;
      const dstBase = (y * outW + x) * 4;
      out[dstBase] = data[srcBase];
      out[dstBase + 1] = data[srcBase + 1];
      out[dstBase + 2] = data[srcBase + 2];
      out[dstBase + 3] = data[srcBase + 3];
    }
  }
  return { data: out, width: outW, height: outH, channels: 4 };
}

// ── orchestration ────────────────────────────────────────────────────────

export async function runPixelSnap(input, { gridWidth, gridHeight, palette = 0, upscale = 1 }) {
  if (!gridWidth || !gridHeight) throw new Error('pixel-snap: gridWidth and gridHeight are required');
  const raw = await loadRawRGBA(input);
  let grid = snapToGrid(raw, gridWidth, gridHeight);
  if (palette > 0) grid = quantizePalette(grid, palette);
  const preview = upscale > 1 ? nearestUpscale(grid, upscale) : null;
  return { grid, preview, sourceWidth: raw.width, sourceHeight: raw.height };
}

export async function gridToPngBuffer(grid) {
  return sharp(grid.data, { raw: { width: grid.width, height: grid.height, channels: 4 } }).png().toBuffer();
}

// ── CLI ──────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      console.error(`pixel-snap.mjs: ${name} requires a value`);
      process.exit(2);
    }
    return value;
  };

  const input = argv[0];
  const gridArg = flag('--grid');
  if (!input || input.startsWith('--') || !gridArg) {
    console.error('usage: pixel-snap.mjs <input> --grid <cols>x<rows> [--palette <N>] [--upscale <N>] [--out <file>] [--json]');
    process.exit(2);
  }
  const gridMatch = /^(\d+)x(\d+)$/.exec(gridArg);
  if (!gridMatch) {
    console.error(`pixel-snap.mjs: --grid must look like 32x32, got "${gridArg}"`);
    process.exit(2);
  }
  const palette = Number(flag('--palette') ?? 0);
  const upscale = Number(flag('--upscale') ?? 1);
  const out = flag('--out') ?? input.replace(/\.png$/i, '') + '.snapped.png';

  const result = await runPixelSnap(input, {
    gridWidth: Number(gridMatch[1]),
    gridHeight: Number(gridMatch[2]),
    palette,
    upscale,
  });
  const target = result.preview ?? result.grid;
  const png = await gridToPngBuffer(target);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, png);

  const summary = {
    out,
    grid: `${result.grid.width}x${result.grid.height}`,
    source: `${result.sourceWidth}x${result.sourceHeight}`,
    palette: palette || null,
    upscale: upscale > 1 ? upscale : null,
  };
  if (argv.includes('--json')) console.log(JSON.stringify(summary, null, 2));
  else console.log(`pixel-snap: ${summary.source} -> ${summary.grid} written to ${out}`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch((err) => {
    console.error(`pixel-snap.mjs: ${err.message}`);
    process.exit(1);
  });
}
