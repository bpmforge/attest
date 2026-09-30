import { clampLeg } from './core/kern.mjs';
import { quantize } from './core/quant.mjs';
import { place } from './util/fixed.mjs';

export const FLEET = ['T2', 'T10', 'T11'];

export function tramLine(tram, meters) {
  const tenths = quantize(clampLeg(meters), 100, { mode: 'up' });
  return `${tram} ran ${place(tenths, { dp: 1 })} km today`;
}
