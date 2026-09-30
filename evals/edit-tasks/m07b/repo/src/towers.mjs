import { readData } from './data.mjs';

// Station codes (as used in newer records) to tower names.
export function towerName(code) {
  return readData('towers')[code];
}
