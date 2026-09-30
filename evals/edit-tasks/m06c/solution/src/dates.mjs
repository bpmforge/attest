// Turns a stored date string into { year, month, day }. Accepts DD/MM/YYYY and YYYY-MM-DD.
export function parseDate(text) {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-').map(Number);
    return { year: y, month: m, day: d };
  }
  const [d, m, y] = t.split('/').map(Number);
  return { year: y, month: m, day: d };
}
