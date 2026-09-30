// Pantry label printer.
export function label(jar) {
  return `${jar.fruit.toUpperCase()} JAM - ${jar.grams} g`;
}

export const SHELF_LIFE_MONTHS = 18;
