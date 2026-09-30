import { readData } from './data.mjs';
import { towerName } from './towers.mjs';
import { stationDay } from './clock.mjs';

const iso = (d) => d.split('/').reverse().join('-');

function normalise(s) {
  if (s.starts) return { who: s.keeper, tower: towerName(s.station), day: stationDay(s.starts) };
  return { who: s.who, tower: s.tower, day: iso(s.on) };
}

export function boardLines() {
  return readData('rota')
    .map(normalise)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.who < b.who ? -1 : a.who > b.who ? 1 : 0))
    .map((s) => `${s.who} @ ${s.tower}, ${s.day}`);
}
