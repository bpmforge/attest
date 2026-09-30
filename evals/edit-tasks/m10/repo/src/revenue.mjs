import { readFileSync } from 'node:fs';
import { allBoats } from './fleet.mjs';
import { rate } from './rates.mjs';

export function revenueReport() {
  const bookings = JSON.parse(readFileSync(new URL('../data/bookings.json', import.meta.url), 'utf8'));
  return allBoats().map((b) => {
    const hours = bookings.filter((x) => x.boat === b.id).reduce((n, x) => n + x.hours, 0);
    return `${b.name}: $${(hours * rate(b.id, 'hourly')).toFixed(2)}`;
  });
}
