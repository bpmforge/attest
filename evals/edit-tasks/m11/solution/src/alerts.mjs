import { nextHotEntry, nextHotTime } from './readings.mjs';

export function alertFor(readings, after) {
  const e = nextHotEntry(readings, after);
  if (!e) return 'All zones normal';
  return `Heat alert: ${e.zone} at ${e.time.toISOString().slice(11, 16)} (${e.temp.toFixed(1)}C)`;
}

export function minutesUntil(readings, now) {
  const when = nextHotTime(readings, now);
  return when ? Math.round((when - now) / 60000) : null;
}
