import { records } from './registry.mjs';

// Every sighting the app records, in feed order.
export function allSightings() {
  return records;
}

export function brightest() {
  return allSightings().reduce((a, b) => (b.magnitude < a.magnitude ? b : a));
}

export function sightingsInMonth(year, month) {
  return allSightings()
    .filter((s) => s.date.year === year && s.date.month === month)
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.date.day - b.s.date.day || a.i - b.i)
    .map(({ s }) => s.comet);
}
