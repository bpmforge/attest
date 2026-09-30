export async function care(id) {
  try {
    const mod = await import(`./care/${id}.mjs`);
    return mod.default;
  } catch {
    return { id, water: 'unknown' };
  }
}
