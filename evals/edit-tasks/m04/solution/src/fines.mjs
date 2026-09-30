export const GRACE_DAYS = 5;
export const FINE_PER_DAY_CENTS = 25;

export function fineCents(daysLate) {
  const billable = Math.max(0, daysLate - GRACE_DAYS);
  return billable * FINE_PER_DAY_CENTS;
}
