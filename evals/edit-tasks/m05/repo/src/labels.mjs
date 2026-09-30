import { listJars } from './inventory.mjs';

export function labelsFor(apiary) {
  return (listJars(apiary) ?? []).map((j) => `${apiary}/${j.id}`);
}
