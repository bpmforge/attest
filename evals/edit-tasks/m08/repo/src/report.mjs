import * as compost from './compost.mjs';

export function batchLine(strawKg, manureKg) {
  const b = compost.mixBatch(strawKg, manureKg);
  return `batch ${b.totalKg} kg, ${compost.moisture(b)} L water`;
}
