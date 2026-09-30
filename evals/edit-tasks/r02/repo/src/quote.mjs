// Single-vessel harbour quotes.
import { settle } from './lib/ledger.mjs';

/** Dues for one vessel, in dollars. */
export function quote(tons, ratePerTon) {
  return settle(tons * ratePerTon);
}
