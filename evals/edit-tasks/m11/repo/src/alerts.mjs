import { nextHotTime, nextHotZone } from './readings.mjs';

export function alertFor(readings, after) {
  const when = nextHotTime(readings, after);
  if (!when) return 'All zones normal';
  const zone = nextHotZone(readings, after);
  return `Heat alert: ${zone} at ${when.toISOString().slice(11, 16)}`;
}

export function minutesUntil(readings, now) {
  const when = nextHotTime(readings, now);
  return when ? Math.round((when - now) / 60000) : null;
}
