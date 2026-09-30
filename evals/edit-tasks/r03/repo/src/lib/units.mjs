// Distance display helpers for the depot boards.

// Metres -> "x.y km". Integer math so 1150 m reads 1.2 (toFixed would say 1.1).
export function fmtLeg(m) {
  const n = Number(m);
  if (!Number.isFinite(n) || n < 0) return '0.0 km';
  const tenths = Math.round(n / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10} km`;
}

// Sums val(row) per key(row); returns a Map in insertion order.
export function tally(rows, key, val) {
  const out = new Map();
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + val(r));
  return out;
}
