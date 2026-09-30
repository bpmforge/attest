import { clampLeg, foldBy } from './core/kern.mjs';
import { quantize } from './core/quant.mjs';
import { seriesCmp } from './core/series.mjs';
import { place } from './util/fixed.mjs';
import { triad } from './util/triad.mjs';

const km = (m) => `${triad(place(quantize(m, 100, { mode: 'up' }), { dp: 1 }))} km`;

export function depotReport(trips) {
  const totals = foldBy(trips, (t) => t.tram, (t) => clampLeg(t.meters));
  let grand = 0;
  for (const v of totals.values()) grand += v;
  const share = (m) => `${place(grand > 0 ? quantize(m * 1000, grand, { mode: 'up' }) : 0, { dp: 1 })}%`;
  const lines = [...totals.keys()]
    .sort(seriesCmp)
    .map((k) => `${k}: ${km(totals.get(k))} (${share(totals.get(k))})`);
  lines.push(`Total: ${km(grand)}`);
  return lines.join('\n');
}
