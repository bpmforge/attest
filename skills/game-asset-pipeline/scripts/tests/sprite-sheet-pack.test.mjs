import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { shelfPack, noOverlap, buildAtlas, packSprites } from '../sprite-sheet-pack.mjs';

async function solidPng(width, height, rgba) {
  return sharp({ create: { width, height, channels: 4, background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] / 255 } } })
    .png()
    .toBuffer();
}

test('shelfPack places sprites without overlap and wraps to a new shelf at max-width', () => {
  const rects = [
    { name: 'a.png', width: 40, height: 20 },
    { name: 'b.png', width: 40, height: 20 },
    { name: 'c.png', width: 40, height: 20 },
  ];
  const { placements, sheetWidth, sheetHeight } = shelfPack(rects, { padding: 2, maxWidth: 90 });
  assert.equal(placements.length, 3);
  assert.ok(noOverlap(placements), 'no two placements overlap');
  // 90 max-width can fit at most 2 x 40px sprites per shelf with padding -> wraps
  const shelfYs = new Set(placements.map((p) => p.y));
  assert.ok(shelfYs.size >= 2, 'packing wrapped to at least 2 shelves');
  assert.ok(sheetWidth <= 90);
  assert.ok(sheetHeight > 20);
});

test('shelfPack is deterministic: same input order and sizes produce identical placements every run', () => {
  const rects = [
    { name: 'z.png', width: 12, height: 8 },
    { name: 'a.png', width: 12, height: 8 },
    { name: 'm.png', width: 16, height: 30 },
  ];
  const run1 = shelfPack(rects);
  const run2 = shelfPack(rects);
  assert.deepEqual(run1, run2);
});

test('shelfPack throws for a sprite wider than max-width', () => {
  assert.throws(
    () => shelfPack([{ name: 'huge.png', width: 500, height: 10 }], { maxWidth: 100 }),
    /exceeds max-width/
  );
});

test('buildAtlas emits TexturePacker-hash-shaped frames keyed by sprite name', () => {
  const placements = [{ name: 'idle_0.png', x: 2, y: 2, width: 16, height: 16 }];
  const atlas = buildAtlas('sheet.png', placements, 20, 20);
  assert.equal(atlas.meta.image, 'sheet.png');
  assert.deepEqual(atlas.meta.size, { w: 20, h: 20 });
  assert.deepEqual(atlas.frames['idle_0.png'].frame, { x: 2, y: 2, w: 16, h: 16 });
  assert.equal(atlas.frames['idle_0.png'].rotated, false);
  assert.deepEqual(atlas.frames['idle_0.png'].sourceSize, { w: 16, h: 16 });
});

test('packSprites: end-to-end in-memory batch produces a sheet PNG and matching atlas frame count', async () => {
  const sprites = [
    { name: 'red.png', buffer: await solidPng(10, 10, [255, 0, 0, 255]) },
    { name: 'green.png', buffer: await solidPng(14, 6, [0, 255, 0, 255]) },
    { name: 'blue.png', buffer: await solidPng(6, 20, [0, 0, 255, 255]) },
  ];
  const { sheet, placements, sheetWidth, sheetHeight } = await packSprites(sprites, { padding: 1, maxWidth: 256 });
  assert.equal(placements.length, 3);
  assert.ok(noOverlap(placements));
  const decoded = await sharp(sheet).metadata();
  assert.equal(decoded.width, sheetWidth);
  assert.equal(decoded.height, sheetHeight);

  const atlas = buildAtlas('sheet.png', placements, sheetWidth, sheetHeight);
  assert.equal(Object.keys(atlas.frames).length, 3);
  for (const name of ['red.png', 'green.png', 'blue.png']) {
    assert.ok(atlas.frames[name], `${name} present in atlas`);
  }
});

test('packSprites throws a clear error on an empty batch', async () => {
  await assert.rejects(() => packSprites([]), /no PNG inputs given/);
});
