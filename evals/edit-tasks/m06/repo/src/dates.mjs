// Dates in our data files are DD/MM/YYYY.
export function parseDate(text) {
  const [d, m, y] = text.split('/').map(Number);
  return { year: y, month: m, day: d };
}
