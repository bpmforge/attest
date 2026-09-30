import { loadSightings } from './loader.mjs';
import { loadAmateur } from './amateur.mjs';

// Every sighting the app knows about: observatory log first, then amateur reports.
export function allSightings() {
  return [...loadSightings(), ...loadAmateur()];
}

export function brightest() {
  return allSightings().reduce((a, b) => (b.magnitude < a.magnitude ? b : a));
}
