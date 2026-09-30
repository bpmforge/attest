import { mixBatch } from './compost.mjs';

export function seedBed(name, strawKg) {
  const batch = mixBatch(strawKg, strawKg / 4);
  return { name, batch };
}
