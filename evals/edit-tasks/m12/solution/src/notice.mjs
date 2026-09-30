import { nextSailing } from './timetable.mjs';
import { toMinutes, fmt } from './times.mjs';

export function describeNext(table, now) {
  const s = nextSailing(table, toMinutes(now));
  if (!s) return 'No more ferries today';
  return `Next ferry to ${s.dest} at ${fmt(s.at)} (delay ${s.delay} min)`;
}

export function minutesUntil(table, now) {
  const s = nextSailing(table, toMinutes(now));
  return s ? s.at - toMinutes(now) : null;
}
