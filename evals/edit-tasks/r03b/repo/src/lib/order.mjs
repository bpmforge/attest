// Comparator for ids like "T2" / "T10": letters first (by code unit), then the number as a number.
export function byNat(a, b) {
  const [, pa, na] = /^(\D*)(\d*)$/.exec(String(a));
  const [, pb, nb] = /^(\D*)(\d*)$/.exec(String(b));
  if (pa !== pb) return pa < pb ? -1 : 1;
  return Number(na || 0) - Number(nb || 0);
}
