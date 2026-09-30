import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Reads a JSON file from the repo's data/ directory.
export function readData(name) {
  const p = fileURLToPath(new URL(`../data/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(p, 'utf8'));
}
