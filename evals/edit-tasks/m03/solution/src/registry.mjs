const llamas = new Map();

export function registerLlama(name, woolGrams) {
  if (llamas.has(name)) throw new Error(`duplicate llama: ${name}`);
  llamas.set(name, { name, woolGrams });
  return llamas.get(name);
}

export function all() {
  return [...llamas.values()];
}

export function reset() {
  llamas.clear();
}
