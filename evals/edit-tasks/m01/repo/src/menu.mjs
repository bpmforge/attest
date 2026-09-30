import { readFileSync } from 'node:fs';

const file = new URL('../data/menu.json', import.meta.url);

export function getItem(sku) {
  const item = JSON.parse(readFileSync(file, 'utf8')).items.find((i) => i.sku === sku);
  if (!item) throw new Error(`unknown sku: ${sku}`);
  return item;
}
