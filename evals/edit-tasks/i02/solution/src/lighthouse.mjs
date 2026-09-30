// Lighthouse log helpers.
export function describeLight(color, flashMs, gapMs) {
  return `${color} light, flash ${flashMs}ms, gap ${gapMs}ms`;
}

/** Whole flashes completed per minute for a light that flashes for flashMs then is dark for gapMs. */
export function flashesPerMinute(flashMs, gapMs) {
  return Math.floor(60000 / (flashMs + gapMs));
}
