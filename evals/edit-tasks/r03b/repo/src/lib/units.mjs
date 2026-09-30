// Distance display helpers for the depot boards.

// A trip distance we can trust: finite and >= 0, else 0 m.
export function usableMeters(m) {
  const n = Number(m);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Metres -> "x.y km". Integer math so 1150 m reads 1.2 (toFixed would say 1.1).
export function fmtLeg(m) {
  const tenths = Math.floor((usableMeters(m) + 50) / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10} km`;
}

// Sums val(row) per key(row); returns a Map in insertion order.
export function tally(rows, key, val) {
  const out = new Map();
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + val(r));
  return out;
}
