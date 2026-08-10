#!/usr/bin/env node
// img-gate.mjs — "Gate A" quality check for a captured screenshot (M21 user-guide
// capture pipeline). Catches bad captures before they're used downstream:
//   - blank-detect:      near-solid-color image (blank/black/white screen)
//   - dominant-color:    dominant color/ratio deviates too far from a per-app
//                         calibrated baseline (error page, wrong app, glitch)
//   - size-floor:        image or file smaller than a sane minimum (truncated
//                         or corrupt capture)
//   - stability:         two "same state" shots differ too much (animation
//                         still settling, flicker) — via pixelmatch
//
// Every check reports pass/fail with a specific reason, not a bare boolean,
// so a calling agent can decide whether to retry. See README.md in this
// directory for the per-app baseline calibration file schema.
//
// CLI:
//   node img-gate.mjs <image> [--baseline <file>] [--second-shot <image>] [--json]
//   node img-gate.mjs --calibrate <image> --app <name> --out <file>

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';

export const DEFAULT_THRESHOLDS = {
  minWidth: 200,
  minHeight: 200,
  minFileBytes: 1024,
  // Per-channel stddev (0-255 scale) at/below this on ALL THREE channels
  // means the image is essentially a solid color. Real UI screenshots,
  // even mostly-white ones, have edges/text/icons that keep stddev well
  // above this floor.
  stddevFloor: 6,
  // Dominant-color comparison vs a per-app baseline (see README.md).
  // dominantRatioTolerance: how far the current dominant-color ratio may
  // drift from the baseline ratio (absolute difference, 0-1 scale).
  dominantRatioTolerance: 0.2,
  // dominantColorDistance: max Euclidean RGB distance between current and
  // baseline dominant color before it counts as "a different color".
  dominantColorDistance: 40,
  // Two-shot stability: fraction of pixels pixelmatch counts as different
  // (0-1 scale) above which the capture is considered unstable.
  stabilityMaxDiffRatio: 0.02,
};

// ── pixel loading ────────────────────────────────────────────────────────
// Flattens onto a white background so a fully (or partially) transparent
// PNG is judged by what it would actually look like rendered — not by
// whatever arbitrary RGB values sit under a zero alpha channel. This is a
// deliberate choice: a fully-transparent capture is exactly the "blank
// screen" case Gate A exists to catch, and it should read as blank.
async function loadRawRGB(input) {
  const image = sharp(Buffer.isBuffer(input) ? input : readFileSync(input));
  const { data, info } = await image
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

// ── checks ───────────────────────────────────────────────────────────────

export function channelStddev({ data, width, height, channels }) {
  const n = width * height;
  const sums = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const base = i * channels;
    sums[0] += data[base];
    sums[1] += data[base + 1];
    sums[2] += data[base + 2];
  }
  const means = sums.map((s) => s / n);
  const sqSums = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const base = i * channels;
    sqSums[0] += (data[base] - means[0]) ** 2;
    sqSums[1] += (data[base + 1] - means[1]) ** 2;
    sqSums[2] += (data[base + 2] - means[2]) ** 2;
  }
  return {
    r: Math.sqrt(sqSums[0] / n),
    g: Math.sqrt(sqSums[1] / n),
    b: Math.sqrt(sqSums[2] / n),
  };
}

// Quantizes each channel into buckets of `binSize` and returns the most
// frequent bucket's representative color plus its share of all pixels.
export function dominantColor({ data, width, height, channels }, { binSize = 16 } = {}) {
  const n = width * height;
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const base = i * channels;
    const r = data[base] - (data[base] % binSize);
    const g = data[base + 1] - (data[base + 1] % binSize);
    const b = data[base + 2] - (data[base + 2] % binSize);
    const key = (r << 16) | (g << 8) | b;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let bestKey = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  const color = [(bestKey >> 16) & 0xff, (bestKey >> 8) & 0xff, bestKey & 0xff];
  return { color, ratio: bestCount / n, binSize };
}

function colorDistance(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

export function checkSizeFloor({ width, height, fileBytes }, thresholds = DEFAULT_THRESHOLDS) {
  const failures = [];
  if (width < thresholds.minWidth || height < thresholds.minHeight) {
    failures.push(
      `size-floor: image is ${width}x${height}px, below minimum ${thresholds.minWidth}x${thresholds.minHeight}px`
    );
  }
  if (fileBytes != null && fileBytes < thresholds.minFileBytes) {
    failures.push(
      `size-floor: file is ${fileBytes} bytes, below minimum ${thresholds.minFileBytes} bytes (likely truncated/corrupt)`
    );
  }
  return { pass: failures.length === 0, failures };
}

export function checkBlankDetect(stddev, thresholds = DEFAULT_THRESHOLDS) {
  const allFlat = stddev.r <= thresholds.stddevFloor && stddev.g <= thresholds.stddevFloor && stddev.b <= thresholds.stddevFloor;
  return {
    pass: !allFlat,
    failures: allFlat
      ? [
          `blank-detect: per-channel stddev (r=${stddev.r.toFixed(2)}, g=${stddev.g.toFixed(2)}, b=${stddev.b.toFixed(2)}) at or below floor ${thresholds.stddevFloor} on all channels — image looks like a solid color`,
        ]
      : [],
  };
}

export function checkDominantColorBaseline(dominant, baseline, thresholds = DEFAULT_THRESHOLDS) {
  if (!baseline) return { pass: true, failures: [], skipped: true };
  const failures = [];
  const dist = colorDistance(dominant.color, baseline.dominantColor);
  if (dist > thresholds.dominantColorDistance) {
    failures.push(
      `dominant-color: dominant color rgb(${dominant.color.join(',')}) is ${dist.toFixed(1)} away from baseline rgb(${baseline.dominantColor.join(',')}) (max ${thresholds.dominantColorDistance})`
    );
  }
  const ratioDelta = Math.abs(dominant.ratio - baseline.dominantRatio);
  if (ratioDelta > thresholds.dominantRatioTolerance) {
    failures.push(
      `dominant-color: dominant-color ratio ${dominant.ratio.toFixed(3)} deviates from baseline ${baseline.dominantRatio.toFixed(3)} by ${ratioDelta.toFixed(3)} (max ${thresholds.dominantRatioTolerance})`
    );
  }
  return { pass: failures.length === 0, failures };
}

// Two-shot stability: both inputs must decode to the same dimensions to be
// compared meaningfully; a dimension mismatch is itself a gate failure
// (the "same state" assumption is already broken).
export async function checkStability(inputA, inputB, thresholds = DEFAULT_THRESHOLDS) {
  const a = await loadRawRGBA(inputA);
  const b = await loadRawRGBA(inputB);
  if (a.width !== b.width || a.height !== b.height) {
    return {
      pass: false,
      failures: [
        `stability: shot dimensions differ (${a.width}x${a.height} vs ${b.width}x${b.height}) — cannot compare`,
      ],
    };
  }
  const diffImage = new Uint8Array(a.width * a.height * 4);
  const diffPixels = pixelmatch(a.data, b.data, diffImage, a.width, a.height, { threshold: 0.1 });
  const diffRatio = diffPixels / (a.width * a.height);
  return {
    pass: diffRatio <= thresholds.stabilityMaxDiffRatio,
    diffRatio,
    diffPixels,
    failures:
      diffRatio > thresholds.stabilityMaxDiffRatio
        ? [
            `stability: two-shot pixel diff ratio ${diffRatio.toFixed(4)} exceeds max ${thresholds.stabilityMaxDiffRatio} (${diffPixels} of ${a.width * a.height} pixels differ) — capture likely still settling`,
          ]
        : [],
  };
}

async function loadRawRGBA(input) {
  const image = sharp(Buffer.isBuffer(input) ? input : readFileSync(input));
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// ── baseline calibration file I/O ───────────────────────────────────────
// See README.md for the schema. Generated from one human-confirmed
// known-good screenshot per app.

export function loadBaseline(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export async function generateBaseline(input, { app, binSize = 16 } = {}) {
  const raw = await loadRawRGB(input);
  const dom = dominantColor(raw, { binSize });
  return {
    app: app || null,
    generatedAt: new Date().toISOString(),
    width: raw.width,
    height: raw.height,
    dominantColor: dom.color,
    dominantRatio: dom.ratio,
    binSize,
  };
}

// ── orchestration ────────────────────────────────────────────────────────

export async function runGateA(input, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const checks = [];
  const filePath = typeof input === 'string' ? input : null;
  const fileBytes = filePath ? statSync(filePath).size : options.fileBytes ?? (Buffer.isBuffer(input) ? input.length : null);

  const raw = await loadRawRGB(input);
  const sizeCheck = checkSizeFloor({ width: raw.width, height: raw.height, fileBytes }, thresholds);
  checks.push({ name: 'size-floor', ...sizeCheck });

  const stddev = channelStddev(raw);
  const blankCheck = checkBlankDetect(stddev, thresholds);
  checks.push({ name: 'blank-detect', ...blankCheck, stddev });

  const dominant = dominantColor(raw);
  let baseline = options.baseline;
  if (typeof baseline === 'string') baseline = loadBaseline(baseline);
  const baselineCheck = checkDominantColorBaseline(dominant, baseline, thresholds);
  checks.push({ name: 'dominant-color', ...baselineCheck, dominant });

  if (options.secondShot != null) {
    const stabilityCheck = await checkStability(input, options.secondShot, thresholds);
    checks.push({ name: 'stability', ...stabilityCheck });
  }

  const failures = checks.flatMap((c) => c.failures || []);
  return { pass: failures.length === 0, checks, failures };
}

// ── CLI ──────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  // Rejects a value that looks like another flag (e.g. `--second-shot
  // --json`) instead of silently swallowing it as `--second-shot`'s value.
  const flag = (name) => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      console.error(`img-gate.mjs: ${name} requires a value`);
      process.exit(2);
    }
    return value;
  };

  if (argv.includes('--calibrate')) {
    const image = flag('--calibrate');
    const app = flag('--app');
    const out = flag('--out');
    if (!image || !out) {
      console.error('usage: img-gate.mjs --calibrate <image> --app <name> --out <file>');
      process.exit(2);
    }
    const baseline = await generateBaseline(image, { app });
    writeFileSync(out, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`baseline written to ${out}`);
    return;
  }

  // Positional: the image path must be argv[0] (per the usage string below).
  // Deliberately NOT "first token not starting with --" — that would
  // misidentify a preceding flag's value (e.g. `--baseline b.json`) as the
  // image path.
  const image = argv[0];
  if (!image || image.startsWith('--')) {
    console.error('usage: img-gate.mjs <image> [--baseline <file>] [--second-shot <image>] [--json]');
    process.exit(2);
  }
  const baselinePath = flag('--baseline');
  const secondShot = flag('--second-shot');
  const result = await runGateA(image, {
    baseline: baselinePath ? loadBaseline(baselinePath) : undefined,
    secondShot,
  });

  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.pass ? 'PASS' : 'FAIL');
    for (const f of result.failures) console.log(`  - ${f}`);
  }
  process.exit(result.pass ? 0 : 1);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main().catch((err) => {
    // A clean message, not a full stack trace — this is meant to be
    // machine-readable by a calling agent, not just human-debugged.
    console.error(`img-gate.mjs: ${err.message}`);
    process.exit(1);
  });
}
