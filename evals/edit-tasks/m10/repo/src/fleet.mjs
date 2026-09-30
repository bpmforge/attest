import { readFileSync } from 'node:fs';

const file = new URL('../data/fleet.json', import.meta.url);

export function allBoats() {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function getBoat(id) {
  const b = allBoats().find((x) => x.id === id);
  if (!b) throw new Error(`unknown boat: ${id}`);
  return b;
}
