import { readFileSync } from 'node:fs';
import { getSpecies } from './species.mjs';

export function price(id) {
  const sale = JSON.parse(readFileSync(new URL('../data/sale.json', import.meta.url), 'utf8'));
  return Math.round(getSpecies(id).cents * (1 - (sale[id] ?? 0)));
}

export function label(id) {
  return `${getSpecies(id).name} $${(price(id) / 100).toFixed(2)}`;
}
