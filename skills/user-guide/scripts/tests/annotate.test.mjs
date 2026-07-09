import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { annotate, annotateToFile, badgeCenter, DEFAULT_OPTIONS } from '../annotate.mjs';
import { knownGoodPng } from './fixtures.mjs';

const ANNOTATE_CLI = fileURLToPath(new URL('../annotate.mjs', import.meta.url));

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

// ── regression: independent review finding A ────────────────────────────
// badgeCenter()'s clamp used to collapse to a single out-of-range point
// (Math.max(imgWidth - margin, margin), which floors to `margin` once
// imgWidth < 2*margin) on small images, clipping the badge off-canvas even
// though the README promises it stays on-canvas. Repro from the review: a
// 30x30 image with a box at (25, 2) put the badge center at (19, 19),
// clipping a 15px-radius badge by 4px on the right/bottom.
test('regression: badge stays on-canvas for the reviewer-reported 30x30 small-image repro', () => {
  const opts = DEFAULT_OPTIONS; // badgeRadius 15, strokeWidth 4 -> margin 19
  const center = badgeCenter({ x: 25, y: 2, width: 4, height: 4 }, 30, 30, opts);
  assert.ok(center.x - opts.badgeRadius >= 0 && center.x + opts.badgeRadius <= 30, `x=${center.x} clips`);
  assert.ok(center.y - opts.badgeRadius >= 0 && center.y + opts.badgeRadius <= 30, `y=${center.y} clips`);
});

test('badgeCenter() clamp range is always well-formed (lower <= upper) regardless of image size', () => {
  const opts = DEFAULT_OPTIONS;
  for (const size of [5, 10, 30, 38, 100, 400]) {
    const center = badgeCenter({ x: 0, y: 0, width: 4, height: 4 }, size, size, opts);
    assert.ok(Number.isFinite(center.x) && Number.isFinite(center.y), `non-finite center for size=${size}`);
    assert.ok(center.x >= 0 && center.x <= size, `x out of [0,${size}] for size=${size}`);
    assert.ok(center.y >= 0 && center.y <= size, `y out of [0,${size}] for size=${size}`);
  }
});

// ── regression: independent review finding B ────────────────────────────
// The CLI's flag() helper used to blindly take argv[i+1] as a flag's value,
// even when that token was itself another flag (e.g. `--color --number 7`
// silently set color to the string "--number"). It now rejects a
// flag-shaped value with a clear error instead of swallowing it.
test('regression: CLI rejects a flag value that looks like another flag, instead of swallowing it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'annotate-cli-test-'));
  const inputPath = join(dir, 'in.png');
  const outputPath = join(dir, 'out.png');
  writeFileSync(inputPath, Buffer.alloc(1)); // content doesn't matter, should fail before reading it

  const result = spawnSync(
    process.execPath,
    [
      ANNOTATE_CLI,
      inputPath,
      outputPath,
      '--x', '10', '--y', '10', '--width', '50', '--height', '20',
      '--color', '--number', '7',
    ],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--color requires a value/);
});
