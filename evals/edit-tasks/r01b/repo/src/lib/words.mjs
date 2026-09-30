import { plainText } from './spelling.mjs';

// The whole words of a string, in plain spelling.
export function wordsOf(s) {
  return plainText(s).split(' ').filter(Boolean);
}
