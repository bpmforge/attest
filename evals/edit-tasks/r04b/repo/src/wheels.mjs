import { plainKey } from './text/plain.mjs';

export const WHEELS = [
  { id: 1, name: 'Comté Vieux', ageMonths: 24 },
  { id: 2, name: 'Comté', ageMonths: 18 },
  { id: 3, name: 'Vieux Comté', ageMonths: 30 },
  { id: 4, name: 'Pont-l’Évêque', ageMonths: 2 },
  { id: 5, name: 'Mont d’Or Vacherin', ageMonths: 3 },
  { id: 6, name: 'Mont d’Or', ageMonths: 3 },
  { id: 7, name: 'Beaufort d’Été', ageMonths: 12 },
  { id: 8, name: 'Cœur de Neufchâtel', ageMonths: 2 },
  { id: 9, name: 'Saint-Nectaire', ageMonths: 4 },
  { id: 10, name: 'Époisses', ageMonths: 2 },
  { id: 11, name: 'Roquefort', ageMonths: 5 },
  { id: 12, name: 'Fort de Joux', ageMonths: 9 },
];

export function wheelByName(name) {
  return WHEELS.find((w) => plainKey(w.name) === plainKey(name));
}
