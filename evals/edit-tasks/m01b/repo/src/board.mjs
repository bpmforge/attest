import { readFileSync } from 'node:fs';
import { label } from './label.mjs';

export function menuBoard() {
  const { order } = JSON.parse(readFileSync(new URL('../data/display.json', import.meta.url), 'utf8'));
  return order.map((sku) => label(sku));
}
