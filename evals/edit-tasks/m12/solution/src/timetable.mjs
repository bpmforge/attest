import { readFileSync } from 'node:fs';
import { toMinutes } from './times.mjs';

export function loadTimetable() {
  return JSON.parse(readFileSync(new URL('../data/timetable.json', import.meta.url), 'utf8'));
}

export function delayMinutes(d) {
  if (d === undefined || d === null) return 0;
  if (typeof d === 'number') return d;
  const m = /^(\d+):(\d\d)$/.exec(d.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number(d);
}

export function nextSailing(table, nowMin) {
  const hit = table.find((e) => toMinutes(e.dep) > nowMin);
  return hit ? { dest: hit.dest, at: toMinutes(hit.dep), delay: delayMinutes(hit.delay) } : null;
}
