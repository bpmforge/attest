import { describeNext } from '../src/alerts.mjs';

export function banner(table, now) {
  const m = /^High tide at (\d\d:\d\dZ)(?: \(.*\))?$/.exec(describeNext(table, now));
  return m ? `Next high: ${m[1]}` : 'No high tide today';
}
