import { fmtLeg, tally, usableMeters } from './lib/units.mjs';
import { byNat } from './lib/order.mjs';
import { groupThousands } from './lib/numfmt.mjs';
import { pct } from './lib/share.mjs';

export function depotReport(trips) {
  const totals = tally(trips, (t) => t.tram, (t) => usableMeters(t.meters));
  let grand = 0;
  for (const v of totals.values()) grand += v;
  const lines = [...totals.keys()]
    .sort(byNat)
    .map((k) => `${k}: ${groupThousands(fmtLeg(totals.get(k)))} (${pct(totals.get(k), grand)})`);
  lines.push(`Total: ${groupThousands(fmtLeg(grand))}`);
  return lines.join('\n');
}
