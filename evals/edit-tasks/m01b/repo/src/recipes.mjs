export async function recipe(sku) {
  const mod = await import(`./recipes/${sku}.mjs`);
  return mod.default;
}
