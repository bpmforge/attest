import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/jars.json', import.meta.url), 'utf8'));

export function listJars(apiary) {
  return data[apiary] ?? [];
}
