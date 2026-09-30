import { readFileSync } from 'node:fs';

const dataUrl = (f) => new URL(`../data/${f}`, import.meta.url);
const feeds = JSON.parse(readFileSync(dataUrl('feeds.json'), 'utf8'));

// Each feed is read by the reader module named after its kind (src/readers/<kind>.mjs).
const lists = await Promise.all(feeds.map(async (f) => {
  const { read } = await import(`./readers/${f.kind}.mjs`);
  return read(readFileSync(dataUrl(f.file), 'utf8'));
}));

export const records = lists.flat();
