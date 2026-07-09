import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { annotate, annotateToFile } from '../annotate.mjs';
import { knownGoodPng } from './fixtures.mjs';

const BOX = { x: 150, y: 90, width: 100, height: 40 };

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function samplePixel(buf, x, y) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
}

test('annotate() returns a buffer that differs from the input', async () => {
  const input = await knownGoodPng();
  const output = await annotate(input, BOX, { number: 1 });
  assert.ok(Buffer.isBuffer(output));
  assert.notEqual(sha256(output), sha256(input));
});

test('annotate() does not mutate the input buffer object', async () => {
  const input = await knownGoodPng();
  const before = Buffer.from(input); // snapshot
  await annotate(input, BOX, { number: 2 });
  assert.equal(sha256(input), sha256(before), 'input buffer bytes changed after annotate()');
});

test('annotate() changes pixel values at the top edge of the highlight box (targeted sample, not full-image match)', async () => {
  const input = await knownGoodPng();
  const output = await annotate(input, BOX, { number: 3, color: '#FF00FF', strokeWidth: 4 });

  // Sample a point directly on the highlight box's top stroke line — should
  // now read close to the annotation color, not the original background.
  const sampleX = BOX.x + Math.floor(BOX.width / 2);
  const sampleY = BOX.y;
  const before = await samplePixel(input, sampleX, sampleY);
  const after = await samplePixel(output, sampleX, sampleY);
  assert.notDeepEqual(after.slice(0, 3), before.slice(0, 3));
  // Expect the stroke pixel to be dominated by magenta (#FF00FF): high R, low G, high B.
  assert.ok(after[0] > 180, `expected high red at stroke, got ${after.join(',')}`);
  assert.ok(after[1] < 120, `expected low green at stroke, got ${after.join(',')}`);
});

test('annotate() leaves pixels far from the box unchanged', async () => {
  const input = await knownGoodPng();
  const output = await annotate(input, BOX, { number: 4 });
  const farX = 5;
  const farY = 295;
  const before = await samplePixel(input, farX, farY);
  const after = await samplePixel(output, farX, farY);
  assert.deepEqual(after.slice(0, 3), before.slice(0, 3));
});

test('annotateToFile() writes a copy and leaves the original file byte-for-byte untouched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'annotate-test-'));
  const inputPath = join(dir, 'original.png');
  const outputPath = join(dir, 'annotated.png');
  writeFileSync(inputPath, await knownGoodPng());

  const beforeHash = sha256(readFileSync(inputPath));
  const beforeMtime = statSync(inputPath).mtimeMs;

  await annotateToFile(inputPath, outputPath, BOX, { number: 5 });

  const afterHash = sha256(readFileSync(inputPath));
  const afterMtime = statSync(inputPath).mtimeMs;

  assert.equal(afterHash, beforeHash, 'original file contents changed');
  assert.equal(afterMtime, beforeMtime, 'original file mtime changed (was rewritten)');
  assert.notEqual(sha256(readFileSync(outputPath)), beforeHash, 'output should differ from original');
});

test('annotateToFile() refuses to write to the same path as the input', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'annotate-test-'));
  const inputPath = join(dir, 'same.png');
  writeFileSync(inputPath, await knownGoodPng());
  await assert.rejects(() => annotateToFile(inputPath, inputPath, BOX), /outputPath must differ from inputPath/);
});

test('annotate() clamps the badge on-canvas when the box sits at the image origin (collision-awareness)', async () => {
  const input = await knownGoodPng();
  const cornerBox = { x: 0, y: 0, width: 60, height: 40 };
  // Should not throw despite the box touching the top-left corner.
  const output = await annotate(input, cornerBox, { number: 9 });
  assert.ok(Buffer.isBuffer(output));
  const meta = await sharp(output).metadata();
  assert.equal(meta.width, (await sharp(input).metadata()).width);
});

test('annotate() rejects a non-positive bounding box instead of silently producing garbage', async () => {
  const input = await knownGoodPng();
  await assert.rejects(() => annotate(input, { x: 10, y: 10, width: 0, height: 20 }));
});
