import { loadRota } from './rota.mjs';

export function boardLines() {
  return loadRota()
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.who < b.who ? -1 : a.who > b.who ? 1 : 0))
    .map((s) => `${s.who} @ ${s.tower}, ${s.day}`);
}
