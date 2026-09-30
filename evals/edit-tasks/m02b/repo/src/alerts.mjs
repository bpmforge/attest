import { nextHighTide } from './tides.mjs';

export function describeNext(table, after) {
  const when = nextHighTide(table, after);
  if (!when) return 'No more high tides';
  return `High tide at ${when.toISOString().slice(11, 16)}Z`;
}

export function minutesUntil(table, now) {
  const when = nextHighTide(table, now);
  return when ? Math.round((when - now) / 60000) : null;
}
