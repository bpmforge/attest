// tickets-seams.mjs — seam records + assembly/long-tail coverage (P-A10/P-A12,
// program laws L8/L9). Chapter module of the tickets.mjs barrel — kept out of
// tickets-graph.mjs so that file stays under the 400-line CODE_BOOK cap; pure
// (reads only the plan object it is handed), same posture as tickets-graph.mjs.
//
// WHY (T1-09): task-decomposer.md's interface-contract rule — "exactly one
// interface-contract module per shared contract, and every lane module that
// needs it lists it in depends_on" — was a manual checklist item; nothing in
// tickets.mjs enforced it, so a board could ship with two modules both
// authoring the same API doc, or a consumer that never depended on the
// contract it builds against. plan.seams[] is the decomposer's explicit,
// machine-checkable statement of each shared contract:
//
//   { "contract": "docs/design/api/X.md",        // the shared contract doc
//     "producer_module": "M-x-contract",         // the ONE interface-contract module
//     "consumer_modules": ["M-a", "M-b"],        // every module built against it
//     "wiring_evidence": "src/a imports src/x"   // how assembly will be proven }
//
// Additive and backward compatible: a plan with no seams[] gets no seam
// errors (same posture as the modules[] layer itself). Enforced by the CLI's
// `validate` verb (tickets.mjs) and by scripts/validators/validate-seams.sh.

/** Hard errors ([x]) for the seam layer. Returns an array of strings. */
export function validateSeams(plan) {
  const errors = [];
  const seams = plan.seams;
  if (seams === undefined) return errors;
  if (!Array.isArray(seams)) return ['seams must be an array of seam records'];
  const modIds = new Set((plan.modules || []).map((m) => m.id));
  const byId = Object.fromEntries((plan.modules || []).map((m) => [m.id, m]));
  const producersByContract = new Map();

  seams.forEach((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) { errors.push(`seam #${i}: must be an object`); return; }
    if (!s.contract || typeof s.contract !== 'string') { errors.push(`seam #${i}: missing string contract`); return; }
    const where = `seam '${s.contract}'`;
    if (!s.producer_module || typeof s.producer_module !== 'string')
      errors.push(`${where}: missing producer_module — a shared contract with no interface-contract module`);
    else if (!modIds.has(s.producer_module))
      errors.push(`${where}: producer_module '${s.producer_module}' is not a module in this plan — the interface-contract module was never emitted`);
    if (!Array.isArray(s.consumer_modules) || s.consumer_modules.length === 0)
      errors.push(`${where}: consumer_modules must be a non-empty array — a contract nobody consumes is not a seam`);
    if (!s.wiring_evidence || typeof s.wiring_evidence !== 'string' || !s.wiring_evidence.trim())
      errors.push(`${where}: missing wiring_evidence — how will assembly across this seam be proven?`);

    // Exactly ONE interface-contract module per shared contract.
    if (typeof s.producer_module === 'string' && s.producer_module) {
      const seen = producersByContract.get(s.contract);
      if (seen && seen !== s.producer_module)
        errors.push(`${where}: two producer modules ('${seen}', '${s.producer_module}') for one shared contract — exactly one interface-contract module per contract`);
      producersByContract.set(s.contract, s.producer_module);
    }

    // Every consumer must exist, must not be its own producer, and must list
    // the producer in depends_on — "the contract is written" is what unblocks
    // it; an absent edge means the consumer can be claimed before the
    // contract exists, which defeats interface-first unblocking.
    for (const c of Array.isArray(s.consumer_modules) ? s.consumer_modules : []) {
      if (typeof c !== 'string' || !modIds.has(c)) { errors.push(`${where}: consumer '${c}' is not a module in this plan`); continue; }
      if (c === s.producer_module) { errors.push(`${where}: '${c}' is both producer and consumer of its own contract`); continue; }
      const deps = byId[c]?.depends_on || [];
      if (typeof s.producer_module === 'string' && modIds.has(s.producer_module) && !deps.includes(s.producer_module))
        errors.push(`${where}: consumer '${c}' does not list producer '${s.producer_module}' in depends_on — it can be claimed before the contract exists`);
    }
  });

  // Two modules both declaring `interface` = the same contract doc is the same
  // defect stated module-side: two interface-contract modules for one contract.
  const ifaceOwners = new Map();
  for (const m of plan.modules || []) {
    if (typeof m.interface !== 'string' || !m.interface) continue;
    const seen = ifaceOwners.get(m.interface);
    if (seen) errors.push(`interface contract '${m.interface}' is declared by two modules ('${seen}', '${m.id}') — exactly one interface-contract module per shared contract`);
    else ifaceOwners.set(m.interface, m.id);
  }
  return errors;
}

// ── P-A12 (T1-12/§14, program law L9): assembly + long-tail coverage ────────
//
// "Tickets closed" is *coded*; "requirements → e2e on main" is *done*. The
// gap between the two is exactly (a) cross-module assembly nobody owned and
// (b) the long-tail states (first-run, empty-state, expired-session,
// error-path, migration, reset) nobody planned. Both checks are consumed by
// validate-requirement-closure.sh, which only engages them once the project
// has adopted the P-A12 output contract (a docs/work/requirement-ledger.json
// exists) — additive, never retroactive.

/**
 * Every cross-module seam (a shared deliverable) needs a FIRST-CLASS assembly
 * ticket — a module carrying `assembly_for: "<contract>"` whose acceptance is
 * the seam's wiring evidence — not "whatever remains" after the parts land.
 */
export function assemblyCoverageGaps(plan) {
  const gaps = [];
  const seams = Array.isArray(plan.seams) ? plan.seams : [];
  const assemblies = new Map();
  for (const m of plan.modules || [])
    if (typeof m.assembly_for === 'string' && m.assembly_for) assemblies.set(m.assembly_for, m);
  for (const s of seams) {
    if (!s || typeof s.contract !== 'string' || !s.contract) continue;
    const a = assemblies.get(s.contract);
    if (!a) { gaps.push({ contract: s.contract, msg: `seam '${s.contract}': shared deliverable has no assembly ticket (no module with assembly_for '${s.contract}')` }); continue; }
    const text = (a.acceptance || []).join(' ');
    if (typeof s.wiring_evidence === 'string' && s.wiring_evidence.trim() && !text.includes(s.wiring_evidence.trim()))
      gaps.push({ contract: s.contract, msg: `seam '${s.contract}': assembly ticket '${a.id}' acceptance does not carry the seam's wiring evidence ('${s.wiring_evidence}')` });
  }
  return gaps;
}

/** The long-tail classes a decomposition must name a wave for (§14.3). */
export const LONG_TAIL_CLASSES = ['first-run', 'empty-state', 'expired-session', 'error-path', 'migration', 'reset'];

/**
 * A decomposed board must carry a NAMED long-tail wave at decomposition time —
 * either a plan.waves[] entry whose name contains "long-tail" (listing its
 * module ids), or at least one module tagged `wave: "long-tail"`. Naming it
 * later ("we'll sweep edge cases at the end") is exactly the deferral this
 * check exists to refuse.
 */
export function longTailWaveGaps(plan) {
  const modules = plan.modules || [];
  if (!modules.length) return [];
  const isLongTail = (v) => typeof v === 'string' && /long[-_ ]?tail/i.test(v);
  const wave = (Array.isArray(plan.waves) ? plan.waves : []).find((w) => w && isLongTail(w.name));
  const tagged = modules.filter((m) => isLongTail(m.wave));
  if (!wave && tagged.length === 0)
    return [{ msg: `no named long-tail wave — decomposition must name the wave covering the long-tail classes (${LONG_TAIL_CLASSES.join(', ')}) up front, not leave them as whatever remains` }];
  if (wave && Array.isArray(wave.modules)) {
    const modIds = new Set(modules.map((m) => m.id));
    return wave.modules.filter((id) => !modIds.has(id)).map((id) => ({ msg: `long-tail wave lists '${id}', which is not a module in this plan` }));
  }
  return [];
}
