// Newer records: keeper, station code, starts (UTC timestamp).
export default (r) => ({ who: r.keeper, tower: r.station, day: r.starts.slice(0, 10) });
