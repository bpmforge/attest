// Renders a whole count of 10^-dp units as a decimal string: place(1234, { dp: 2 }) -> "12.34". dp defaults to 2.
export function place(n, { dp = 2 } = {}) {
  const s = String(Math.abs(n)).padStart(dp + 1, '0');
  const out = dp ? `${s.slice(0, -dp)}.${s.slice(-dp)}` : s;
  return n < 0 ? `-${out}` : out;
}
