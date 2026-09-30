// Compost recipe maths for the mushroom beds.
export function blendBatch(strawKg, manureKg) {
  return { strawKg, manureKg, totalKg: strawKg + manureKg };
}

export function moisture(batch) {
  return batch.totalKg * 0.6;
}
