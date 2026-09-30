import { terms } from './terms.mjs';

// 0 = name is the query, 1 = name starts with the query, 2 = anything else (punctuation and spacing ignored).
export function rankOf(name, query) {
  const n = terms(name).join(' ');
  const q = terms(query).join(' ');
  if (n === q) return 0;
  return n.startsWith(q) ? 1 : 2;
}
