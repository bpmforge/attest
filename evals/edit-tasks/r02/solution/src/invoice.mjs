// Harbour invoicing.
import { quote } from './quote.mjs';

export const CURRENCY = 'USD';

export function invoiceTotal(lines) {
  const cents = lines.reduce((sum, l) => sum + Math.round(quote(l.tons, l.ratePerTon) * 100), 0);
  return cents / 100;
}
