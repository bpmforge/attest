import { getItem } from './menu.mjs';

export function label(sku) {
  const item = getItem(sku);
  return `${item.name} $${(item.cents / 100).toFixed(2)}`;
}
