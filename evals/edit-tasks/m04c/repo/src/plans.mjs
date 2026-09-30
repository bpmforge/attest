// Fee rule per membership plan; each plan lives in plans/<name>.mjs.
export async function planFee(plan, daysLate) {
  const { default: p } = await import(`../plans/${plan}.mjs`);
  return p.fee(daysLate);
}
