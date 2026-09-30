import { readFileSync } from 'node:fs';

export function kioskBanner() {
  const c = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
  return `${c.title}: late fee ${c.rateLabel}`;
}
