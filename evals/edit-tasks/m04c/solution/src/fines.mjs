export const GRACE_DAYS = 3;
export const FINE_PER_DAY_CENTS = 40;

export function fineCents(daysLate) {
  const billable = Math.max(0, daysLate - GRACE_DAYS);
  return billable * FINE_PER_DAY_CENTS;
}
