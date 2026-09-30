// Integer rounding of num/den (whole numbers, den > 0) to a whole count, done in exact integer arithmetic.
// An exact half is settled by opts.mode: 'even' (the default), 'up' or 'down'.
export function quantize(num, den, { mode = 'even' } = {}) {
  const r = num % den;
  const q = (num - r) / den;
  const twice = 2 * r;
  if (twice < den) return q;
  if (twice > den) return q + 1;
  if (mode === 'up') return q + 1;
  if (mode === 'down') return q;
  return q % 2 === 0 ? q : q + 1;
}

// Whole units in num/den, remainder dropped.
export function snap(num, den) {
  return Math.floor(num / den);
}

// Whole units needed to cover num/den.
export function ceilDiv(num, den) {
  return Math.ceil(num / den);
}
