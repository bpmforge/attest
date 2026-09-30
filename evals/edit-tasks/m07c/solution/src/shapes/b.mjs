import { towerName } from '../towers.mjs';
import { stationDay } from '../clock.mjs';

// Newer records: keeper, station code, starts (UTC timestamp).
export default (r) => ({ who: r.keeper, tower: towerName(r.station), day: stationDay(r.starts) });
