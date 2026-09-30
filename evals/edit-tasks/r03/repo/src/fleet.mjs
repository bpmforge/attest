import { fmtLeg } from './lib/units.mjs';

export const FLEET = ['T2', 'T10', 'T11'];

export function tramLine(tram, meters) {
  return `${tram} ran ${fmtLeg(meters)} today`;
}
