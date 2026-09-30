import { WHEELS } from './wheels.mjs';
import { plainKey } from './text/plain.mjs';
import { terms } from './text/terms.mjs';
import { rankOf } from './text/rank.mjs';

export function searchWheels(query) {
  const need = terms(query);
  if (!need.length) return [];
  return WHEELS.map((w, i) => ({ w, i, key: plainKey(w.name) }))
    .filter(({ key }) => need.every((t) => key.includes(t)))
    .map((x) => ({ ...x, r: rankOf(x.w.name, query) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.w);
}
