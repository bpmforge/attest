import { WHEELS } from './wheels.mjs';
import { fold } from './core/fold.mjs';
import { lex } from './core/lex.mjs';
import { tier } from './core/tier.mjs';

const wordsOf = (s) => lex(fold(s, { ligatures: true }));

export function searchWheels(query) {
  const want = wordsOf(query);
  if (!want.length) return [];
  return WHEELS.map((w, i) => ({ w, i, words: wordsOf(w.name) }))
    .filter(({ words }) => want.every((t) => words.join(' ').includes(t)))
    .map((x) => ({ ...x, r: tier(x.words, want, { partial: true }) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.w);
}
