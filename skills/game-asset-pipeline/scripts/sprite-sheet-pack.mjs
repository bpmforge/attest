#!/usr/bin/env node
// sprite-sheet-pack.mjs — sprite-sheet + engine-import step of the M9
// game-asset-pipeline (T9.5). Packs a batch of individual sprite PNGs into
// one sheet image and emits an atlas manifest in the TexturePacker "JSON
// (hash)" layout — the de-facto portable atlas format directly consumable by
// Phaser/PixiJS and convertible into Godot AtlasTexture / Unity sprite-sheet
// metadata by existing importer tooling on the engine side. This script
// deliberately stops at that portable manifest — writing a bespoke importer
// for one specific engine is gameplay-engineer's job when a project commits
// to an engine, not this deterministic, engine-agnostic packing step.
//
// Packing algorithm: deterministic shelf packing — sort sprites by height
// descending, then place left-to-right filling shelves top-to-bottom,
// starting a new shelf when the current row runs out of width. Simple,
// reproducible (same input order + size => same output every run, which
// matters for diffable atlases), and good enough for uniform-ish sprite
// batches (the common case for a generated asset batch).
//
// CLI:
//   node sprite-sheet-pack.mjs <dir-of-pngs> --out <sheet.png> [--json <atlas.json>]
//                              [--padding <px>] [--max-width <px>]

import { readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export function listPngs(dir) {
  return readdirSync(dir)
    .filter((f) => extname(f).toLowerCase() === '.png')
    .sort() // deterministic input order regardless of filesystem readdir order
    .map((f) => join(dir, f));
}

// Shelf-packs a list of {name, width, height} rects. Returns placements
// {name, x, y, width, height} plus the overall sheet size. `maxWidth`
// bounds how wide a shelf may grow before wrapping to a new one; padding is
// applied between every placed sprite to avoid texture-bleed at render time.
export function shelfPack(rects, { padding = 2, maxWidth = 2048 } = {}) {
  const ordered = [...rects].sort((a, b) => b.height - a.height || a.name.localeCompare(b.name));
  const placements = [];
  let shelfY = padding;
  let shelfX = padding;
  let shelfHeight = 0;
  let sheetWidth = 0;

  for (const rect of ordered) {
    if (rect.width > maxWidth - 2 * padding) {
      throw new Error(`sprite-sheet-pack: "${rect.name}" is ${rect.width}px wide, exceeds max-width ${maxWidth}`);
    }
    if (shelfX + rect.width + padding > maxWidth) {
      shelfY += shelfHeight + padding;
      shelfX = padding;
      shelfHeight = 0;
    }
    placements.push({ name: rect.name, x: shelfX, y: shelfY, width: rect.width, height: rect.height });
    sheetWidth = Math.max(sheetWidth, shelfX + rect.width + padding);
    shelfHeight = Math.max(shelfHeight, rect.height);
    shelfX += rect.width + padding;
  }
  const sheetHeight = shelfY + shelfHeight + padding;
  return { placements, sheetWidth, sheetHeight };
}

export function noOverlap(placements) {
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      const overlapX = a.x < b.x + b.width && b.x < a.x + a.width;
      const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
      if (overlapX && overlapY) return false;
    }
  }
  return true;
}

// TexturePacker "JSON (hash)" shape — frames keyed by filename, each with
// frame/spriteSourceSize/sourceSize, plus a meta block naming the sheet.
export function buildAtlas(sheetName, placements, sheetWidth, sheetHeight) {
  const frames = {};
  for (const p of placements) {
    frames[p.name] = {
      frame: { x: p.x, y: p.y, w: p.width, h: p.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: p.width, h: p.height },
      sourceSize: { w: p.width, h: p.height },
    };
  }
  return {
    frames,
    meta: {
      app: 'game-asset-pipeline/sprite-sheet-pack.mjs',
      image: sheetName,
      size: { w: sheetWidth, h: sheetHeight },
      scale: '1',
    },
  };
}

// `inputs` items are either a file path string or `{name, buffer}` (used by
// tests to pack in-memory sprites without touching disk).
export async function packSprites(inputs, options = {}) {
  const rects = [];
  const sources = new Map();
  for (const input of inputs) {
    const isPath = typeof input === 'string';
    const name = isPath ? basename(input) : input.name;
    const source = isPath ? input : input.buffer;
    const meta = await sharp(source).metadata();
    rects.push({ name, width: meta.width, height: meta.height });
    sources.set(name, source);
  }
  if (rects.length === 0) throw new Error('sprite-sheet-pack: no PNG inputs given');

  const { placements, sheetWidth, sheetHeight } = shelfPack(rects, options);
  if (!noOverlap(placements)) throw new Error('sprite-sheet-pack: internal packing produced overlapping placements');

  const composites = placements.map((p) => ({ input: sources.get(p.name), left: p.x, top: p.y }));
  const sheet = await sharp({
    create: { width: sheetWidth, height: sheetHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return { sheet, placements, sheetWidth, sheetHeight };
}

// ── CLI ──────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      console.error(`sprite-sheet-pack.mjs: ${name} requires a value`);
      process.exit(2);
    }
    return value;
  };

  const dir = argv[0];
  const outPng = flag('--out');
  if (!dir || dir.startsWith('--') || !outPng) {
    console.error('usage: sprite-sheet-pack.mjs <dir-of-pngs> --out <sheet.png> [--json <atlas.json>] [--padding <px>] [--max-width <px>]');
    process.exit(2);
  }
  const padding = flag('--padding') ? Number(flag('--padding')) : undefined;
  const maxWidth = flag('--max-width') ? Number(flag('--max-width')) : undefined;
  const jsonOut = flag('--json') ?? outPng.replace(/\.png$/i, '') + '.json';

  const inputs = listPngs(dir);
  if (inputs.length === 0) {
    console.error(`sprite-sheet-pack.mjs: no .png files found in ${dir}`);
    process.exit(1);
  }
  const { sheet, placements, sheetWidth, sheetHeight } = await packSprites(inputs, { padding, maxWidth });
  writeFileSync(outPng, sheet);
  const atlas = buildAtlas(basename(outPng), placements, sheetWidth, sheetHeight);
  writeFileSync(jsonOut, JSON.stringify(atlas, null, 2) + '\n');

  console.log(`sprite-sheet-pack: ${placements.length} sprites -> ${outPng} (${sheetWidth}x${sheetHeight}), atlas -> ${jsonOut}`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch((err) => {
    console.error(`sprite-sheet-pack.mjs: ${err.message}`);
    process.exit(1);
  });
}
