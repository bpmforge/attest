// Apiary hive registry.
export const hives = [
  { id: 1, name: 'Queen Agnes', boxes: 3 },
  { id: 2, name: 'Ödön the Great', boxes: 2 },
  { id: 3, name: 'Old Mill Hive', boxes: 4 },
];

export function listHives() {
  return hives.map((h) => h.name);
}
