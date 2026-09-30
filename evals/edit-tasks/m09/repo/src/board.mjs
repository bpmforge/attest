import { readFileSync } from 'node:fs';
import { hasSpecies } from './species.mjs';
import { label } from './pricing.mjs';
import { inStock } from './stock.mjs';
import { FEATURED_ID } from './config/featured.mjs';

export function shelfBoard() {
  const { order } = JSON.parse(readFileSync(new URL('../data/shelves.json', import.meta.url), 'utf8'));
  return order.filter(hasSpecies).map((id) => `${label(id)} (${inStock(id)} left)`);
}

export function featured() {
  return `Featured: ${label(FEATURED_ID)}`;
}
