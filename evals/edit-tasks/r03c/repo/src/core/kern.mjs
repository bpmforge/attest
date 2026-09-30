// Trip-leg kernels. A measured leg must pass clampLeg before it may be summed: finite and >= 0, else 0 m.
export function clampLeg(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Sums val(row) per key(row); returns a Map in first-seen key order.
export function foldBy(rows, key, val) {
  const out = new Map();
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + val(r));
  return out;
}

// Loose coercion used by the old yard sheets.
export function coerceLeg(v) {
  return Number(v) || 0;
}

// How many rows fall under each key.
export function countBy(rows, key) {
  const out = new Map();
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + 1);
  return out;
}
