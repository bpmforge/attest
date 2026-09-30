import { readFileSync } from 'node:fs';

export function loadReadings() {
  return JSON.parse(readFileSync(new URL('../data/readings.json', import.meta.url), 'utf8'));
}

export function nextHotTime(readings, after) {
  const hit = readings.find((r) => r.flag === 'hot' && new Date(r.t) > after);
  return hit ? new Date(hit.t) : null;
}

export function nextHotZone(readings, after) {
  const hit = readings.find((r) => r.flag === 'hot' && new Date(r.t) > after);
  return hit ? hit.zone : null;
}
