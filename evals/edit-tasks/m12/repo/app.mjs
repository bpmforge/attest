import { run } from './src/cli.mjs';
import { announce } from './board/announce.mjs';
import { loadTimetable } from './src/timetable.mjs';

const now = process.argv[2] ?? '12:00';
console.log(run(now));
console.log(announce(loadTimetable(), now));
