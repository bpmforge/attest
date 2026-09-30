import { listJars } from './inventory.mjs';

export function report(apiary) {
  const jars = listJars(apiary);
  if (!jars) return `No jars at ${apiary}`;
  const grams = jars.reduce((s, j) => s + j.grams, 0);
  return `${apiary}: ${jars.length} jars, ${grams}g`;
}
