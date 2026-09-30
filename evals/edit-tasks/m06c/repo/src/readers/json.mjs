import { parseDate } from '../dates.mjs';

// Amateur-astronomer reports.
export function read(text) {
  return JSON.parse(text).map((r) => ({ date: parseDate(r.seen), comet: r.object, magnitude: r.mag }));
}
