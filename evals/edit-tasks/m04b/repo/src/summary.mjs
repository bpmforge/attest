import { readFileSync } from 'node:fs';

export function policySummary() {
  const p = JSON.parse(readFileSync(new URL('../data/policy.json', import.meta.url), 'utf8'));
  return `Grace ${p.graceDays} days, then ${p.finePerDayCents} cents/day`;
}
