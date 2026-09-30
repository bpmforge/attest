import { label } from './label.mjs';
import { getItem } from './menu.mjs';

export function describeOrder(order) {
  return order.map((line) => `${line.qty} x ${label(line.sku)}`).join('; ');
}

export function orderTotal(order) {
  return order.reduce((sum, line) => sum + getItem(line.sku).cents * line.qty, 0) / 100;
}
