// Beekeeper's hive inspection planner.
export const DEFAULT_INTERVAL_DAYS = 7;

/** Day number of the n-th inspection (1-based), given the day of the first one. */
export function inspectionDay(firstDay, intervalDays, n) {
  return firstDay + intervalDays * n;
}

export function inspectionDays(firstDay, intervalDays, count) {
  const days = [];
  for (let n = 1; n <= count; n++) days.push(inspectionDay(firstDay, intervalDays, n));
  return days;
}
