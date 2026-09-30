import { WHEELS } from './wheels.mjs';

export function oldest() {
  return WHEELS.reduce((a, b) => (b.ageMonths > a.ageMonths ? b : a));
}
