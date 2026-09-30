import { label } from './label.mjs';

export function describeOrder(order) {
  return order.map((line) => `${line.qty} x ${label(line.sku)}`).join('; ');
}
