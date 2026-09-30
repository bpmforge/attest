import { blendBatch } from './compost.mjs';

export function seedBed(name, strawKg) {
  const batch = blendBatch(strawKg, strawKg / 4);
  return { name, batch };
}
