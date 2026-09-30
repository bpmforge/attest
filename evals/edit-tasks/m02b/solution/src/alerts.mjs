import { nextHighEntry, nextHighTide } from './tides.mjs';

export function describeNext(table, after) {
  const next = nextHighEntry(table, after);
  if (!next) return 'No more high tides';
  return `High tide at ${next.time.toISOString().slice(11, 16)}Z (${next.height.toFixed(1)}m)`;
}

export function minutesUntil(table, now) {
  const when = nextHighTide(table, now);
  return when ? Math.round((when - now) / 60000) : null;
}
