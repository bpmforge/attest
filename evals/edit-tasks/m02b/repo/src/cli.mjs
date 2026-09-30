import { loadTable } from './tides.mjs';
import { describeNext } from './alerts.mjs';

export function run(nowIso) {
  return describeNext(loadTable(), new Date(nowIso));
}
