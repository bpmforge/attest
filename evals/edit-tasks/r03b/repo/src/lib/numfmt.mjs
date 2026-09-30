// Puts comma thousands separators into the first run of digits of a display string: "12345.6 km" -> "12,345.6 km".
export function groupThousands(s) {
  return String(s).replace(/\d+/, (d) => d.replace(/\B(?=(\d{3})+$)/g, ','));
}
