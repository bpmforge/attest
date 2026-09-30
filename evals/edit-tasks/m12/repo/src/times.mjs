export function toMinutes(s) {
  const m = /^(\d{1,2}):(\d\d)(?: ?(AM|PM))?$/i.exec(s.trim());
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return h * 60 + Number(m[2]);
}

export function fmt(min) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(min / 60))}:${p(min % 60)}`;
}
