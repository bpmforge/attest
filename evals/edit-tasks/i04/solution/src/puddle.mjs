// Puddle depth log.
export function totalDepth(readings) {
  return readings.reduce((sum, r) => sum + r.cm, 0);
}

/** Name of the deepest puddle; the first one listed wins ties; null when there are no readings. */
export function deepestPuddle(readings) {
  let best = null;
  for (const r of readings) if (best === null || r.cm > best.cm) best = r;
  return best === null ? null : best.name;
}
