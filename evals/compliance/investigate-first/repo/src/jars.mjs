export const JARS = [{ id: "j1", grams: 250 }, { id: "j2", grams: 500 }];
export function totalGrams(jars = JARS) {
  return jars.reduce((s, j) => s + j.grams, 0);
}
