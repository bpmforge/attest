import { loadSightings } from './loader.mjs';

export function brightest() {
  return loadSightings().reduce((a, b) => (b.magnitude < a.magnitude ? b : a));
}

export function sightingsInMonth(year, month) {
  return loadSightings()
    .filter((s) => s.date.year === year && s.date.month === month)
    .map((s) => s.comet);
}
