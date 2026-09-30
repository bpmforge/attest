import { parseDate } from '../dates.mjs';

// Observatory log: date,comet,magnitude with a header row.
export function read(text) {
  return text.trim().split('\n').slice(1).map((line) => {
    const [date, comet, magnitude] = line.split(',');
    return { date: parseDate(date), comet, magnitude: Number(magnitude) };
  });
}
