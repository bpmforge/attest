import { parseDate } from '../dates.mjs';

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

// Observatory log: date,comet,magnitude with a header row.
export function read(text) {
  return text.trim().split('\n').slice(1).map((line) => {
    const [date, comet, magnitude] = splitCsv(line.replace(/\r$/, ''));
    return { date: parseDate(date), comet, magnitude: Number(magnitude) };
  });
}
