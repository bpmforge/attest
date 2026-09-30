import { readData } from './data.mjs';

// Normalises every rota record to { who, tower, day } with the shape module named by its "fmt" tag.
const shapes = new Map();
function shapeFor(fmt) {
  if (!shapes.has(fmt)) shapes.set(fmt, import(`./shapes/${fmt}.mjs`).then((m) => m.default, () => null));
  return shapes.get(fmt);
}

const records = readData('rota');
const shifts = [];
for (const r of records) {
  const shape = await shapeFor(r.fmt);
  if (shape) shifts.push(shape(r));
}

export const stats = { loaded: shifts.length, total: records.length };

export function loadRota() {
  return shifts.slice();
}
