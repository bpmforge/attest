import { readFileSync } from 'node:fs';
import { fineCents } from './fines.mjs';

export function quickQuote(daysLate) {
  const table = JSON.parse(readFileSync(new URL('../data/fine-table.json', import.meta.url), 'utf8'));
  if (daysLate <= 3) return 0;
  return table[String(daysLate)] ?? fineCents(daysLate);
}
