import { records } from './registry.mjs';

// Every sighting the app records, in feed order.
export function allSightings() {
  return records;
}

export function brightest() {
  return allSightings().reduce((a, b) => (b.magnitude < a.magnitude ? b : a));
}
