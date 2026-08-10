// fixtures.mjs — synthetic PNG generators for img-gate/annotate tests.
// Built with sharp (SVG rasterization) so the test suite is self-contained
// and reproducible — no binary screenshot fixtures checked into the repo.

import sharp from 'sharp';

const WIDTH = 400;
const HEIGHT = 300;

function svgToPng(svg) {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// A truly blank capture: one solid dark color, no structure at all. This is
// the case blank-detect exists to catch directly — per-channel stddev
// should be exactly 0.
export function blankPng({ width = WIDTH, height = HEIGHT, color = '#141414' } = {}) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${color}"/>
  </svg>`;
  return svgToPng(svg);
}

// A "known-good" shot: varied chrome (header bar, sidebar, an accent
// button) against a light background. Real UI screenshots look like this —
// enough structure to give meaningfully non-zero stddev and a dominant
// color (the background) that doesn't dominate the whole frame.
export function knownGoodPng({ width = WIDTH, height = HEIGHT } = {}) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#FFFFFF"/>
    <rect x="0" y="0" width="${width}" height="48" fill="#1E5AC8"/>
    <rect x="0" y="48" width="90" height="${height - 48}" fill="#C8CDD5"/>
    <rect x="${width - 140}" y="80" width="100" height="36" rx="6" fill="#D6334C"/>
    <circle cx="200" cy="180" r="30" fill="#2FA36B"/>
  </svg>`;
  return svgToPng(svg);
}

// A "half-rendered loading skeleton": near-uniform light-gray field with a
// handful of slightly-darker gray placeholder rectangles (the classic
// shimmer-skeleton look). What makes this "skeleton-like" rather than
// "blank": it has *some* structure (a few rectangles), so raw per-channel
// stddev is not near-zero and blank-detect should NOT fire on it in
// isolation. What makes it a bad capture: it is overwhelmingly one flat
// gray tone with none of the real app's color variety (no header/accent/
// content colors) — so its dominant-color ratio is far higher, and its
// dominant color far grayer, than a per-app baseline calibrated from a
// known-good shot of the same app. Gate A is expected to catch this via
// the dominant-color-vs-baseline check, not blank-detect.
export function skeletonPng({ width = WIDTH, height = HEIGHT } = {}) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#CACACA"/>
    <rect x="16" y="16" width="200" height="20" rx="4" fill="#B4B4B4"/>
    <rect x="16" y="48" width="320" height="14" rx="4" fill="#B8B8B8"/>
    <rect x="16" y="72" width="280" height="14" rx="4" fill="#B8B8B8"/>
    <rect x="16" y="110" width="120" height="120" rx="8" fill="#B0B0B0"/>
  </svg>`;
  return svgToPng(svg);
}

// A tiny near-duplicate of `base` with one small rectangle nudged a few
// pixels, for two-shot stability testing (simulates a stable capture with
// negligible re-render noise well under the diff-ratio threshold).
export function stableVariantPng({ width = WIDTH, height = HEIGHT } = {}) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#FFFFFF"/>
    <rect x="0" y="0" width="${width}" height="48" fill="#1E5AC8"/>
    <rect x="0" y="48" width="90" height="${height - 48}" fill="#C8CDD5"/>
    <rect x="${width - 140}" y="82" width="100" height="36" rx="6" fill="#D6334C"/>
    <circle cx="200" cy="180" r="30" fill="#2FA36B"/>
  </svg>`;
  return svgToPng(svg);
}

// A shot that has clearly moved on (large chunk of the frame changed) for
// two-shot instability testing.
export function unstableVariantPng({ width = WIDTH, height = HEIGHT } = {}) {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#F5F5F5"/>
    <rect x="0" y="0" width="${width}" height="48" fill="#1E5AC8"/>
    <rect x="0" y="0" width="${width}" height="${height}" fill="#111111" fill-opacity="0.6"/>
  </svg>`;
  return svgToPng(svg);
}
