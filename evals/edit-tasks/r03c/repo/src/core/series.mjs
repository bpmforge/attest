// Comparator for series ids like "T2" / "T10": the letter prefix by code unit, then the digits as a number.
export function seriesCmp(a, b) {
  const [, pa, na] = /^(\D*)(\d*)$/.exec(String(a));
  const [, pb, nb] = /^(\D*)(\d*)$/.exec(String(b));
  if (pa !== pb) return pa < pb ? -1 : 1;
  return Number(na || 0) - Number(nb || 0);
}

// Plain code-unit order.
export function cmpLex(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Dictionary order with embedded numbers.
export function cmpLocale(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}
