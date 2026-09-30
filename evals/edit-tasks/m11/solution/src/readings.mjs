import { readFileSync } from 'node:fs';

export function loadReadings() {
  return JSON.parse(readFileSync(new URL('../data/readings.json', import.meta.url), 'utf8'));
}

export function celsius(v) {
  if (typeof v !== 'string') return v;
  return /F$/i.test(v.trim()) ? (parseFloat(v) - 32) / 1.8 : parseFloat(v);
}

export function nextHotEntry(readings, after) {
  const hit = readings.find((r) => r.flag === 'hot' && new Date(r.t) > after);
  return hit ? { time: new Date(hit.t), zone: hit.zone, temp: celsius(hit.temp) } : null;
}

export function nextHotTime(readings, after) {
  const e = nextHotEntry(readings, after);
  return e ? e.time : null;
}

export function nextHotZone(readings, after) {
  const e = nextHotEntry(readings, after);
  return e ? e.zone : null;
}
