import { alertFor } from '../src/alerts.mjs';

export function statusLine(readings, now) {
  const m = /^Heat alert: (.+) at (\d\d:\d\d)(?: \(.*\))?$/.exec(alertFor(readings, now));
  return m ? `ATTENTION ${m[1]} @ ${m[2]}` : 'Greenhouse OK';
}
