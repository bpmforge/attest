import { readFileSync } from 'node:fs';

export function loadTable() {
  return JSON.parse(readFileSync(new URL('../data/tides.json', import.meta.url), 'utf8'));
}

export function metres(h) {
  return typeof h === 'string' ? parseFloat(h) * 0.3048 : h;
}

export function nextHighEntry(table, after) {
  const hit = table.find((e) => e.type === 'high' && new Date(e.t) > after);
  return hit ? { time: new Date(hit.t), height: metres(hit.h) } : null;
}

export function nextHighTide(table, after) {
  const e = nextHighEntry(table, after);
  return e ? e.time : null;
}
