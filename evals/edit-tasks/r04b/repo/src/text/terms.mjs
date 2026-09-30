import { plainKey } from './plain.mjs';

// The words of a string: plain key split on anything that is not a letter or digit.
export function terms(s) {
  return plainKey(s).split(/[^a-z0-9]+/).filter(Boolean);
}
