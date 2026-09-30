import { WHEELS } from './wheels.mjs';
import { plainKey } from './text/plain.mjs';

export function searchWheels(query) {
  const q = plainKey(query);
  return WHEELS.filter((w) => plainKey(w.name).includes(q));
}
