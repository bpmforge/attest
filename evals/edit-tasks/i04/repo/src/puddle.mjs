// Puddle depth log.
export function totalDepth(readings) {
  return readings.reduce((sum, r) => sum + r.cm, 0);
}
