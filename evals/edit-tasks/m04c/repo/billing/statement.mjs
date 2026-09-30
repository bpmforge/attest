import { readFileSync } from 'node:fs';
import { planFee } from '../src/plans.mjs';

const { weeklyCents } = JSON.parse(readFileSync(new URL('../data/billing.json', import.meta.url), 'utf8'));

// Each full week past the grace period is billed at the flat weekly price; the rest day by day.
export async function statement(plan, daysLate) {
  const billable = Math.max(0, daysLate - 3);
  const weeks = Math.floor(billable / 7);
  return weeks * weeklyCents + (await planFee(plan, 3 + (billable % 7)));
}
