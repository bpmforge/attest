import { plainKey } from './text/plain.mjs';

export const WHEELS = [
  { id: 1, name: 'Comté', ageMonths: 18 },
  { id: 2, name: 'Beaufort d’Été', ageMonths: 12 },
  { id: 3, name: 'Roquefort', ageMonths: 5 },
  { id: 4, name: 'Mimolette Vieille', ageMonths: 24 },
];

export function wheelByName(name) {
  return WHEELS.find((w) => plainKey(w.name) === plainKey(name));
}
