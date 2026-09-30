import { readFileSync } from 'node:fs';

export function inStock(sku) {
  const stock = JSON.parse(readFileSync(new URL('../data/stock.json', import.meta.url), 'utf8'));
  return stock[sku] ?? 0;
}
