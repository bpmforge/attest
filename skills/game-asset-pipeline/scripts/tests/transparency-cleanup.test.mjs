import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { detectBackground, unPremultiply, cleanTransparency, runTransparencyCleanup, rgbaToPngBuffer } from '../transparency-cleanup.mjs';

function rawFromPixels(width, height, pixels) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    data.set(pixels[i], i * 4);
  }
  return { data, width, height, channels: 4 };
}

test('detectBackground averages the four corner pixels', () => {
  const width = 2;
  const height = 2;
  // corners: TL=(255,255,255), TR=(255,255,255), BL=(255,255,255), BR=(1,1,1)
  const raw = rawFromPixels(width, height, [
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [1, 1, 1, 255],
  ]);
  const bg = detectBackground(raw);
  // average of 255,255,255,1 = 191.5 -> rounds to 192 (Math.round)
  assert.deepEqual(bg, [192, 192, 192]);
});

test('unPremultiply recovers the true sprite color from a background-blended fringe pixel', () => {
  // observed = bg*(1-a) + fg*a, with bg=white, fg=pure red, a=0.5
  const bg = [255, 255, 255];
  const observed = [255, 128, 128]; // matches (255*.5+255*.5, 255*.5+0*.5, 255*.5+0*.5) rounded
  const [r, g, b] = unPremultiply(observed, bg, 0.5);
  assert.ok(Math.abs(r - 255) <= 2);
  assert.ok(Math.abs(g - 1) <= 2);
  assert.ok(Math.abs(b - 1) <= 2);
});

test('unPremultiply returns black at alpha 0 rather than dividing by zero', () => {
  assert.deepEqual(unPremultiply([10, 20, 30], [0, 0, 0], 0), [0, 0, 0]);
});

test('cleanTransparency: background-bleed fringe pixel is killed, real edge pixel is kept and de-fringed', () => {
  const bg = [255, 255, 255];
  const raw = rawFromPixels(2, 3, [
    [255, 255, 255, 255], // corner (background sample)
    [255, 255, 255, 255], // corner
    [255, 255, 255, 255], // corner
    // row 2: a bleed fringe pixel (close to bg, mid alpha) and a real edge pixel
    [250, 250, 250, 100], // bleed: close to bg -> killed
    [255, 128, 128, 128], // real edge: bg-blended red at ~50% -> kept + de-fringed
    [1, 1, 1, 255], // corner (background sample, opposite corner)
  ]);
  const result = cleanTransparency(raw, { bg, lowAlpha: 32, highAlpha: 224, bgDistanceTolerance: 60 });
  const bleedPixel = result.data.subarray(3 * 4, 3 * 4 + 4);
  const edgePixel = result.data.subarray(4 * 4, 4 * 4 + 4);
  assert.equal(bleedPixel[3], 0, 'bleed fringe pixel killed (alpha 0)');
  assert.equal(edgePixel[3], 255, 'real edge pixel kept opaque');
  assert.ok(edgePixel[0] > 240, 'de-fringed red channel restored near 255');
  assert.ok(edgePixel[1] < 40, 'de-fringed green channel bleed removed');
  assert.equal(result.stats.total, 6);
  assert.equal(result.stats.killed + result.stats.deFringed + result.stats.untouched, 6);
});

test('cleanTransparency: fully-transparent pixels stay killed, fully-opaque pixels pass through unchanged', () => {
  const raw = rawFromPixels(1, 2, [
    [10, 20, 30, 0],
    [40, 50, 60, 255],
  ]);
  const result = cleanTransparency(raw, { bg: [255, 255, 255] });
  assert.equal(result.data[3], 0);
  assert.deepEqual([result.data[4], result.data[5], result.data[6], result.data[7]], [40, 50, 60, 255]);
});

test('runTransparencyCleanup end-to-end produces a decodable PNG with the fringe removed', async () => {
  const width = 4;
  const height = 4;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const base = (y * width + x) * 4;
      const isCore = x > 0 && x < 3 && y > 0 && y < 3;
      if (isCore) {
        data.set([200, 30, 30, 255], base); // opaque sprite body
      } else {
        data.set([255, 255, 255, 20], base); // near-transparent white matte
      }
    }
  }
  const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const result = await runTransparencyCleanup(png, {});
  assert.equal(result.stats.killed, 12, 'the 12 matte border pixels are killed');
  const outPng = await rgbaToPngBuffer(result);
  const decoded = await sharp(outPng).metadata();
  assert.equal(decoded.width, width);
  assert.equal(decoded.height, height);
});
