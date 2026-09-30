// Old board code; kept until the boards are retired.
export function formatKm(m) {
  return `${(Math.trunc(m / 100) / 10).toFixed(1)} km`;
}

export function sharePct(part, total) {
  return `${((part / total) * 100).toFixed(1)}%`;
}

export function sortIds(ids) {
  return [...ids].sort();
}
