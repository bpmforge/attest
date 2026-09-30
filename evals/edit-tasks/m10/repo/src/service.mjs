import { readFileSync } from 'node:fs';

export function lastService(id) {
  const rows = JSON.parse(readFileSync(new URL('../data/service.json', import.meta.url), 'utf8'));
  const row = rows.find(([boat]) => boat === id);
  return row ? row[1] : 'never';
}
