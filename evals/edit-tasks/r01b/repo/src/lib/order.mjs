import { plainText } from './spelling.mjs';

const CHUNK = /\d+|\D+/g;

// Natural comparator on plain spelling: digit runs compare as numbers, text by code unit (no locale). 0 when equal.
export function cmpNatural(a, b) {
  const xs = plainText(a).match(CHUNK) ?? [];
  const ys = plainText(b).match(CHUNK) ?? [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const [x, y] = [xs[i], ys[i]];
    if (/^\d/.test(x) && /^\d/.test(y)) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (x !== y) return x < y ? -1 : 1;
  }
  return Math.sign(xs.length - ys.length);
}
