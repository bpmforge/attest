import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/jars.json', import.meta.url), 'utf8'));

export function listJars(apiary) {
  const jars = data[apiary];
  if (!jars || jars.length === 0) return null;
  return jars;
}
