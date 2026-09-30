import { loadReadings } from './readings.mjs';
import { alertFor } from './alerts.mjs';

export function run(nowIso) {
  return alertFor(loadReadings(), new Date(nowIso));
}
