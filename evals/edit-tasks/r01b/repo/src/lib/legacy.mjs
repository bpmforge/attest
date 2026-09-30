// Kept for the old admin screens; do not extend.
export function normalizeName(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function compareNames(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}
