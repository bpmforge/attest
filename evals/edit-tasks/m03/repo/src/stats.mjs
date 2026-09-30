import { all } from './registry.mjs';

export function totalWool() {
  return all().reduce((s, l) => s + l.woolGrams, 0);
}
