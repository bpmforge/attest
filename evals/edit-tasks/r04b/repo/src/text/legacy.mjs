// Old counter-screen helpers; kept until that screen is retired.
export function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

export function sortWheels(ws) {
  return [...ws].sort((a, b) => a.name.localeCompare(b.name));
}
