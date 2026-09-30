// Groups the first run of digits of a display string in threes: "12345.6" -> "12,345.6". sep defaults to ",".
export function triad(text, { sep = ',' } = {}) {
  return String(text).replace(/\d+/, (d) => d.replace(/\B(?=(\d{3})+$)/g, sep));
}

// Continental grouping (dots).
export function localeInt(n) {
  return Number(n).toLocaleString('de-DE');
}

// Left-pads digits to a multiple of three.
export function pad3(s) {
  const t = String(s);
  return t.padStart(Math.ceil(t.length / 3) * 3, '0');
}
