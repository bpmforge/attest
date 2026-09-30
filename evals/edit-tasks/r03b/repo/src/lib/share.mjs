// part/total as "x.y%", half-up, integer math (1.15% must read 1.2%; toFixed says 1.1). No total -> "0.0%".
export function pct(part, total) {
  if (!(total > 0)) return '0.0%';
  const tenths = Math.floor((part * 2000 + total) / (2 * total));
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}
