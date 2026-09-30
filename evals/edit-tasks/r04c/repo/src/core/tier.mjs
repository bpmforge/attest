// Match tier of a word list against a query word list: 0 = same words in the same order,
// 1 = the word list begins with the query words, 2 = neither. By default every query word must equal a whole
// word of the list; opts.partial lets the last query word be just the start of a word.
export function tier(words, query, { partial = false } = {}) {
  if (words.length === query.length && words.every((w, i) => w === query[i])) return 0;
  if (query.length > words.length) return 2;
  const last = query.length - 1;
  const begins = query.every((q, i) => (i === last && partial ? words[i].startsWith(q) : words[i] === q));
  return begins ? 1 : 2;
}

// How far into the list the query first shows up.
export function nearness(words, query) {
  const at = words.join(' ').indexOf(query.join(' '));
  return at < 0 ? Infinity : at;
}

// Difference in word count.
export function spread(words, query) {
  return Math.abs(words.length - query.length);
}
