export function estimate(daysLate, rateCents = 25) {
  return Math.max(0, daysLate - 3) * rateCents;
}
