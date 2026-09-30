// Apiary hive registry.
export const hives = [
  { id: 1, name: 'Ödön 2', boxes: 2 },
  { id: 2, name: 'Odon 2', boxes: 3 },
  { id: 3, name: 'Straße Hive 10', boxes: 4 },
  { id: 4, name: 'Strasse Hive 9', boxes: 1 },
  { id: 5, name: 'Ærø Hive 3', boxes: 2 },
  { id: 6, name: 'Aero hive 12', boxes: 5 },
  { id: 7, name: 'Łódź Hive 7', boxes: 3 },
  { id: 8, name: 'Lodz Hive 007', boxes: 2 },
  { id: 9, name: 'Queen-Agnes 10', boxes: 3 },
  { id: 10, name: 'queen agnes 9', boxes: 4 },
  { id: 11, name: 'Søren Box 2', boxes: 1 },
  { id: 12, name: 'Old Mill Hive', boxes: 4 },
  { id: 13, name: 'Old Mill Hive 2', boxes: 2 },
];

export function listHives() {
  return hives.map((h) => h.name);
}
