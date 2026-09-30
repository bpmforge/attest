import { nextHighTide } from './tides.mjs';

export function describeNext(table, after) {
  const next = nextHighTide(table, after);
  if (!next) return 'No more high tides';
  return `High tide at ${next.time.toISOString().slice(11, 16)}Z`;
}

export function minutesUntil(table, now) {
  const next = nextHighTide(table, now);
  return next ? Math.round((next.time - now) / 60000) : null;
}
