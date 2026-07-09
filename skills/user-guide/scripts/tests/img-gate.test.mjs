import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runGateA,
  channelStddev,
  dominantColor,
  checkSizeFloor,
  checkBlankDetect,
  checkDominantColorBaseline,
  checkStability,
  generateBaseline,
  DEFAULT_THRESHOLDS,
} from '../img-gate.mjs';
import { blankPng, knownGoodPng, skeletonPng, stableVariantPng, unstableVariantPng } from './fixtures.mjs';

const IMG_GATE_CLI = fileURLToPath(new URL('../img-gate.mjs', import.meta.url));

// ── (a) blank PNG ──────────────────────────────────────────────────────────

test('blank PNG: per-channel stddev is ~0 and blank-detect fails', async () => {
  const png = await blankPng();
  const result = await runGateA(png);
  assert.equal(result.pass, false);
  const blank = result.checks.find((c) => c.name === 'blank-detect');
  assert.equal(blank.pass, false);
  assert.ok(blank.stddev.r <= DEFAULT_THRESHOLDS.stddevFloor);
  assert.ok(blank.stddev.g <= DEFAULT_THRESHOLDS.stddevFloor);
  assert.ok(blank.stddev.b <= DEFAULT_THRESHOLDS.stddevFloor);
  assert.match(result.failures.join(' '), /blank-detect/);
});

test('blank PNG fails gate even with a baseline supplied (blank-detect fires independently)', async () => {
  const good = await knownGoodPng();
  const baseline = await generateBaseline(good, { app: 'demo' });
  const blank = await blankPng();
  const result = await runGateA(blank, { baseline });
  assert.equal(result.pass, false);
});

// ── (b) half-rendered skeleton capture ─────────────────────────────────────

test('skeleton fixture is NOT flagged by blank-detect (it has structure, just low variety)', async () => {
  const png = await skeletonPng();
  const gate = await runGateA(png);
  const blank = gate.checks.find((c) => c.name === 'blank-detect');
  assert.equal(blank.pass, true, `expected skeleton to have stddev above the blank floor, got r=${blank.stddev.r} g=${blank.stddev.g} b=${blank.stddev.b}`);
});

test('skeleton fixture fails the dominant-color check against a known-good per-app baseline', async () => {
  const good = await knownGoodPng();
  const baseline = await generateBaseline(good, { app: 'demo' });
  const skeleton = await skeletonPng();
  const result = await runGateA(skeleton, { baseline });
  assert.equal(result.pass, false);
  const domCheck = result.checks.find((c) => c.name === 'dominant-color');
  assert.equal(domCheck.pass, false);
  assert.match(result.failures.join(' '), /dominant-color/);
});

// ── (c) known-good shot ─────────────────────────────────────────────────────

test('known-good shot passes size-floor, blank-detect, and dominant-color-vs-self-baseline cleanly', async () => {
  const good = await knownGoodPng();
  const baseline = await generateBaseline(good, { app: 'demo' });
  const result = await runGateA(good, { baseline });
  assert.equal(result.pass, true, `expected known-good to pass, got failures: ${result.failures.join('; ')}`);
  for (const check of result.checks) {
    assert.equal(check.pass, true, `${check.name} unexpectedly failed`);
  }
});

// ── size-floor ───────────────────────────────────────────────────────────

test('size-floor rejects an undersized image with a specific reason', async () => {
  const tiny = await blankPng({ width: 40, height: 30, color: '#FFFFFF' });
  const result = await runGateA(tiny);
  assert.equal(result.pass, false);
  const sizeCheck = result.checks.find((c) => c.name === 'size-floor');
  assert.equal(sizeCheck.pass, false);
  assert.match(sizeCheck.failures[0], /size-floor/);
});

// ── two-shot stability ─────────────────────────────────────────────────────

test('two near-identical shots pass the stability check', async () => {
  const a = await knownGoodPng();
  const b = await stableVariantPng();
  const stability = await checkStability(a, b);
  assert.equal(stability.pass, true, `expected stable pair to pass, diffRatio=${stability.diffRatio}`);
  assert.ok(stability.diffRatio <= DEFAULT_THRESHOLDS.stabilityMaxDiffRatio);
});

test('two very different shots fail the stability check with a specific reason', async () => {
  const a = await knownGoodPng();
  const b = await unstableVariantPng();
  const stability = await checkStability(a, b);
  assert.equal(stability.pass, false);
  assert.match(stability.failures[0], /stability/);
  assert.ok(stability.diffRatio > DEFAULT_THRESHOLDS.stabilityMaxDiffRatio);
});

test('runGateA wires a supplied secondShot through to the stability check', async () => {
  const a = await knownGoodPng();
  const b = await unstableVariantPng();
  const result = await runGateA(a, { secondShot: b });
  assert.equal(result.pass, false);
  assert.ok(result.checks.some((c) => c.name === 'stability' && c.pass === false));
});

test('stability check fails cleanly (not a crash) when shot dimensions differ', async () => {
  const a = await knownGoodPng({ width: 400, height: 300 });
  const b = await knownGoodPng({ width: 200, height: 150 });
  const stability = await checkStability(a, b);
  assert.equal(stability.pass, false);
  assert.match(stability.failures[0], /dimensions differ/);
});

// ── unit-level checks on the underlying math ────────────────────────────────

test('channelStddev is 0,0,0 for a single solid color', async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(await blankPng({ color: '#808080' }))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stddev = channelStddev({ data, width: info.width, height: info.height, channels: info.channels });
  assert.equal(stddev.r, 0);
  assert.equal(stddev.g, 0);
  assert.equal(stddev.b, 0);
});

test('dominantColor ratio is 1.0 for a solid-color image', async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(await blankPng({ color: '#808080' }))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const dom = dominantColor({ data, width: info.width, height: info.height, channels: info.channels });
  assert.equal(dom.ratio, 1);
});

test('checkSizeFloor and checkBlankDetect and checkDominantColorBaseline are pure/synchronous and reusable standalone', () => {
  const size = checkSizeFloor({ width: 10, height: 10, fileBytes: 10 });
  assert.equal(size.pass, false);
  const blank = checkBlankDetect({ r: 0, g: 0, b: 0 });
  assert.equal(blank.pass, false);
  const noBaseline = checkDominantColorBaseline({ color: [1, 2, 3], ratio: 0.5 }, null);
  assert.equal(noBaseline.pass, true);
  assert.equal(noBaseline.skipped, true);
});

// ── edge cases ───────────────────────────────────────────────────────────

test('a fully-transparent PNG is flattened to white and reads as blank, not crashed on', async () => {
  const sharp = (await import('sharp')).default;
  const png = await sharp({
    create: { width: 300, height: 300, channels: 4, background: { r: 10, g: 200, b: 10, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const result = await runGateA(png);
  assert.equal(result.pass, false);
  const blank = result.checks.find((c) => c.name === 'blank-detect');
  assert.equal(blank.pass, false);
});

test('a 1x1 pixel image fails size-floor and blank-detect without throwing', async () => {
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 5, g: 5, b: 5 } } })
    .png()
    .toBuffer();
  const result = await runGateA(png);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes('size-floor')));
});

// ── regression: independent review finding B ────────────────────────────
// The CLI's flag() helper used to blindly take argv[i+1] as a flag's value,
// even when that token was itself another flag (e.g. `--second-shot
// --json` silently tried to open a file literally named "--json"). It now
// rejects a flag-shaped value with a clear error instead of swallowing it.
test('regression: CLI rejects a flag value that looks like another flag, instead of swallowing it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'img-gate-cli-test-'));
  const imagePath = join(dir, 'good.png');
  writeFileSync(imagePath, await knownGoodPng());

  const result = spawnSync(process.execPath, [IMG_GATE_CLI, imagePath, '--second-shot', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--second-shot requires a value/);
});
