import { run } from './src/cli.mjs';
import { statusLine } from './dashboard/status.mjs';
import { loadReadings } from './src/readings.mjs';

const now = process.argv[2] ?? new Date().toISOString();
console.log(run(now));
console.log(statusLine(loadReadings(), new Date(now)));
