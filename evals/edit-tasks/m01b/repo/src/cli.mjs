import { describeOrder, orderTotal } from './order.mjs';

const DEFAULT_ORDER = [{ sku: 'eclair', qty: 2 }];

export function run(order = DEFAULT_ORDER) {
  return `Quick order: ${describeOrder(order)} = $${orderTotal(order).toFixed(2)}`;
}
