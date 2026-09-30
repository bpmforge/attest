// Shift start times are stored in UTC. The station clock is fixed at UTC-4 all year (no DST).
const STATION_OFFSET_MIN = -240;

// Calendar day (YYYY-MM-DD) at the station for a UTC ISO timestamp.
export function stationDay(utcIso) {
  return new Date(Date.parse(utcIso) + STATION_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}
