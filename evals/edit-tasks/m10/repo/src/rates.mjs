import { readFileSync } from 'node:fs';
import { getBoat } from './fleet.mjs';
import { WEEKEND_SPECIAL } from './config/defaults.mjs';

export function rate(id, kind) {
  const rates = JSON.parse(readFileSync(new URL('../data/rates.json', import.meta.url), 'utf8'));
  return (rates[`${id}/${kind}`] ?? 0) / 100;
}

export function special() {
  return `Weekend special: ${getBoat(WEEKEND_SPECIAL).name} $${rate(WEEKEND_SPECIAL, 'daily').toFixed(2)}/day`;
}
