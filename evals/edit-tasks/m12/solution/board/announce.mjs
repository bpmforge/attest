import { describeNext } from '../src/notice.mjs';

export function announce(table, now) {
  const m = /^Next ferry to (.+) at (\d\d:\d\d)(?: \(.*\))?$/.exec(describeNext(table, now));
  return m ? `NOW BOARDING ${m[1].toUpperCase()} ${m[2]}` : 'No sailings';
}
