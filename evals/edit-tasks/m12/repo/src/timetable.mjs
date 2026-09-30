import { readFileSync } from 'node:fs';
import { toMinutes } from './times.mjs';

export function loadTimetable() {
  return JSON.parse(readFileSync(new URL('../data/timetable.json', import.meta.url), 'utf8'));
}

export function nextSailing(table, nowMin) {
  const hit = table.find((e) => toMinutes(e.dep) > nowMin);
  return hit ? { dest: hit.dest, at: toMinutes(hit.dep) } : null;
}
