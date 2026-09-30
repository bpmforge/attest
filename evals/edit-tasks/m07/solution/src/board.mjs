import { readData } from './data.mjs';

const iso = (d) => d.split('/').reverse().join('-');

export function boardLines() {
  return readData('rota')
    .map((s) => ({ ...s, day: iso(s.on) }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .map((s) => `${s.who} @ ${s.tower}, ${s.day}`);
}
