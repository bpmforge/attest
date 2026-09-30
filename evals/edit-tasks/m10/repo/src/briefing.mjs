export async function briefing(id) {
  try {
    const mod = await import(new URL(`./briefings/${id}.mjs`, import.meta.url));
    return mod.default;
  } catch {
    return { boat: id, rules: ['none on file'] };
  }
}
