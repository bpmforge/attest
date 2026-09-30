import { readFileSync } from 'node:fs';
import { parseDate } from './dates.mjs';

// Amateur-astronomer reports, normalised to the same shape as loadSightings().
export function loadAmateur() {
  const rows = JSON.parse(readFileSync(new URL('../data/amateur.json', import.meta.url), 'utf8'));
  return rows.map((r) => ({ date: parseDate(r.seen), comet: r.object, magnitude: r.mag }));
}
