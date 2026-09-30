import { fmtLeg, tally } from './lib/units.mjs';
import { byNat } from './lib/order.mjs';

export function depotReport(trips) {
  const totals = tally(trips, (t) => t.tram, (t) => t.meters);
  return [...totals.keys()].sort(byNat).map((k) => `${k}: ${fmtLeg(totals.get(k))}`).join('\n');
}
