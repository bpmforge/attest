import { loadSightings } from './loader.mjs';
import { loadAmateur } from './amateur.mjs';

// Every sighting the app knows about: observatory log first, then amateur reports.
export function allSightings() {
  return [...loadSightings(), ...loadAmateur()];
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
