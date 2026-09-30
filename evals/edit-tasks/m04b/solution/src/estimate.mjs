export function estimate(daysLate, rateCents = 40) {
  return Math.max(0, daysLate - 3) * rateCents;
}
