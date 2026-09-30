// Turns a stored date string into { year, month, day }.
export function parseDate(text) {
  const [d, m, y] = text.trim().split('/').map(Number);
  return { year: y, month: m, day: d };
}
