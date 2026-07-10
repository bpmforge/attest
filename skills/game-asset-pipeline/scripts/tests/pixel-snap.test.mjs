import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  cellDominantColor,
  snapToGrid,
  quantizePalette,
  nearestUpscale,
  runPixelSnap,
  gridToPngBuffer,
} from '../pixel-snap.mjs';

// A synthetic "noisy pixel art" fixture: an 80x80 image made of 8 cells of
// 10x10px, each cell one dominant color plus a few noise pixels of a
// different color — the exact shape a diffusion model's almost-pixel-art
// output takes. Built in-process so no binary fixture is checked in.
async function noisyGridFixture() {
  const cellPx = 10;
  const cols = 8;
  const colors = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 0, 255],
    [255, 0, 255, 255],
    [0, 255, 255, 255],
    [128, 64, 32, 255],
    [10, 10, 10, 255],
  ];
  const width = cellPx * cols;
  const height = cellPx;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = Math.floor(x / cellPx);
      const base = (y * width + x) * 4;
      // 90% of pixels are the cell's true color; a deterministic minority
      // (every 7th pixel) is noise — the dominant-color vote must still win.
      const isNoise = (x + y) % 7 === 0;
      const color = isNoise ? [200, 200, 200, 255] : colors[cell];
      data[base] = color[0];
      data[base + 1] = color[1];
      data[base + 2] = color[2];
      data[base + 3] = color[3];
    }
  }
  const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { png, width, height, cellPx, cols, colors };
}

test('cellDominantColor picks the majority color over minority noise', () => {
  const width = 4;
  const height = 4;
  const raw = { data: Buffer.alloc(width * height * 4), width, height, channels: 4 };
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const isNoise = i === 0;
    const [r, g, b, a] = isNoise ? [9, 9, 9, 255] : [200, 20, 20, 255];
    raw.data[base] = r;
    raw.data[base + 1] = g;
    raw.data[base + 2] = b;
    raw.data[base + 3] = a;
  }
  const [r, g, b, a] = cellDominantColor(raw, 0, 0, 4, 4);
  assert.equal(r >= 192 && r <= 208, true);
  assert.equal(g, 16);
  assert.equal(b, 16);
  assert.equal(a, 240);
});

test('snapToGrid reduces a noisy 80x10 image to 8 clean cells matching the true colors', async () => {
  const { png, cols, cellPx, height, colors } = await noisyGridFixture();
  const image = sharp(png);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw = { data, width: info.width, height: info.height, channels: info.channels };
  const grid = snapToGrid(raw, cols, 1);
  assert.equal(grid.width, cols);
  assert.equal(grid.height, 1);
  for (let cell = 0; cell < cols; cell++) {
    const base = cell * 4;
    const expected = colors[cell];
    // binned to nearest 16 by cellDominantColor's bucket voting
    assert.ok(Math.abs(grid.data[base] - (expected[0] - (expected[0] % 16))) <= 16, `cell ${cell} red channel`);
    assert.ok(Math.abs(grid.data[base + 1] - (expected[1] - (expected[1] % 16))) <= 16, `cell ${cell} green channel`);
  }
  void cellPx;
  void height;
});

test('quantizePalette reduces the grid to at most N distinct colors and preserves transparency', () => {
  const width = 4;
  const height = 1;
  const data = Buffer.from([
    255, 0, 0, 255, // near-red
    250, 5, 5, 255, // near-red (should map to same palette entry as above)
    0, 0, 255, 255, // blue
    0, 0, 0, 0, // fully transparent — must stay transparent, not join a color bucket
  ]);
  const grid = { data, width, height, channels: 4 };
  const quantized = quantizePalette(grid, 2);
  const colorsSeen = new Set();
  for (let i = 0; i < width; i++) {
    const base = i * 4;
    if (quantized.data[base + 3] === 0) continue;
    colorsSeen.add(`${quantized.data[base]},${quantized.data[base + 1]},${quantized.data[base + 2]}`);
  }
  assert.ok(colorsSeen.size <= 2);
  assert.equal(quantized.data[3 * 4 + 3], 0, 'transparent pixel stays transparent after quantization');
});

test('nearestUpscale produces a blocky (non-blurred) NxN expansion of each source pixel', () => {
  const grid = { data: Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]), width: 2, height: 1, channels: 4 };
  const up = nearestUpscale(grid, 3);
  assert.equal(up.width, 6);
  assert.equal(up.height, 3);
  // every pixel in the left 3x3 block must be pure red, right block pure green
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const base = (y * 6 + x) * 4;
      assert.deepEqual([up.data[base], up.data[base + 1], up.data[base + 2]], [255, 0, 0]);
    }
    for (let x = 3; x < 6; x++) {
      const base = (y * 6 + x) * 4;
      assert.deepEqual([up.data[base], up.data[base + 1], up.data[base + 2]], [0, 255, 0]);
    }
  }
});

test('runPixelSnap end-to-end: noisy fixture -> clean grid -> valid PNG', async () => {
  const { png, cols } = await noisyGridFixture();
  const result = await runPixelSnap(png, { gridWidth: cols, gridHeight: 1, palette: 4, upscale: 4 });
  assert.equal(result.grid.width, cols);
  assert.equal(result.preview.width, cols * 4);
  const outPng = await gridToPngBuffer(result.preview);
  const decoded = await sharp(outPng).metadata();
  assert.equal(decoded.width, cols * 4);
  assert.equal(decoded.height, 4);
});

test('runPixelSnap rejects a missing grid size', async () => {
  const { png } = await noisyGridFixture();
  await assert.rejects(() => runPixelSnap(png, {}), /gridWidth and gridHeight are required/);
});
