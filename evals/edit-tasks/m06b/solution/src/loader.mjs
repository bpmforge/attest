import { readFileSync } from 'node:fs';
import { parseDate } from './dates.mjs';

function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function loadSightings() {
  const lines = readFileSync(new URL('../data/sightings.csv', import.meta.url), 'utf8').trim().split('\n');
  return lines.slice(1).map((line) => {
    const [date, comet, magnitude] = splitCsv(line.replace(/\r$/, ''));
    return { date: parseDate(date), comet, magnitude: Number(magnitude) };
  });
}
