import { readFileSync } from 'node:fs';
import { parseDate } from './dates.mjs';

export function loadSightings() {
  const lines = readFileSync(new URL('../data/sightings.csv', import.meta.url), 'utf8').trim().split('\n');
  return lines.slice(1).map((line) => {
    const [date, comet, magnitude] = line.split(',');
    return { date: parseDate(date), comet, magnitude: Number(magnitude) };
  });
}
