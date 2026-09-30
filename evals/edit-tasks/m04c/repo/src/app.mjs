import { terms } from './terms.mjs';
import { planFee } from './plans.mjs';
import { statement } from '../billing/statement.mjs';

// What the front desk prints for an overdue item.
export async function deskSlip(plan, daysLate) {
  return { terms: terms(), fee: await planFee(plan, daysLate), billed: await statement(plan, daysLate) };
}
