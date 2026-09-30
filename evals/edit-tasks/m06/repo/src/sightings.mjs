import { loadSightings } from './loader.mjs';

export function brightest() {
  return loadSightings().reduce((a, b) => (b.magnitude < a.magnitude ? b : a));
}
