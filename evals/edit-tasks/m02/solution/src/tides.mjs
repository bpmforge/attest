import { readFileSync } from 'node:fs';

export function loadTable() {
  return JSON.parse(readFileSync(new URL('../data/tides.json', import.meta.url), 'utf8'));
}

export function nextHighTide(table, after) {
  const hit = table.find((e) => e.type === 'high' && new Date(e.t) > after);
  return hit ? { time: new Date(hit.t), height: hit.h } : null;
}
