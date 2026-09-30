// Shared text helpers.
const MARKS = /[\u0300-\u036f]/g;

/** Canonical comparison key: accents stripped, lowercased, every run of non-alphanumerics collapsed to one '-', no leading/trailing '-'. */
export function fold(s) {
  return String(s)
    .normalize('NFD')
    .replace(MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function pad(s, n) {
  return String(s).padEnd(n, ' ');
}
