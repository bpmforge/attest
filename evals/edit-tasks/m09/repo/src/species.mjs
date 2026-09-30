import { readFileSync } from 'node:fs';

const file = new URL('../data/species.json', import.meta.url);
const all = () => JSON.parse(readFileSync(file, 'utf8')).species;

export function hasSpecies(id) {
  return all().some((s) => s.id === id);
}

export function getSpecies(id) {
  const s = all().find((x) => x.id === id);
  if (!s) throw new Error(`unknown species: ${id}`);
  return s;
}
