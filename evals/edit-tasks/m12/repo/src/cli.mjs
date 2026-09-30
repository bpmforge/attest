import { loadTimetable } from './timetable.mjs';
import { describeNext } from './notice.mjs';

export function run(now) {
  return describeNext(loadTimetable(), now);
}
