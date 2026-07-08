// derive-lanes.mjs — deterministic lane inference from write_scope (T10.4).
//
// A ModuleTicket's `lane` is a project-defined parallel-safety partition
// (TICKET_SCHEMA.md): different lanes never share write_scope, so "different
// lane = safe to start in parallel" holds. Hand-picking lane names per module
// doesn't scale and isn't reproducible. This derives a lane from the shape of
// a module's own write_scope instead, so two modules that touch the same
// project subsystem land in the same lane (and are therefore flagged if they
// ever collide), without a human naming each one.
//
// Rule: lane = the basename of the write_scope's containing directory.
//   - A glob path ending in /** or /* names its own directory directly
//     (e.g. "src/x/ledger/**" -> "ledger" -- that glob IS the directory).
//   - A concrete file path uses its parent directory's basename
//     (e.g. "src/x/pit/bars.py" -> "pit", not "x" or "bars.py").
// Only the module's FIRST write_scope entry is used — a module's write_scope
// entries should already share one subsystem (that's what makes them one
// module), so the first entry is representative.
//
// This intentionally does NOT try to skip generic wrapper directories like
// "src"/"lib"/"app" by name, because that requires knowing which segment is
// the project's own top-level package (project-specific, not inferable from
// a single path in isolation) -- "parent directory of the file" is the one
// rule that's both generic across project layouts and matches how these
// real-world write_scopes are actually organized (one subsystem = one dir).

export function deriveLane(writeScope) {
  const first = (writeScope || [])[0];
  if (!first) return 'misc';

  const stripped = first.replace(/\/\*\*?$/, '');
  const isGlob = stripped !== first;
  const segments = stripped.split('/').filter(Boolean);

  if (isGlob) {
    return segments[segments.length - 1] || 'misc';
  }
  if (segments.length >= 2) {
    return segments[segments.length - 2];
  }
  return segments[0] || 'misc';
}

// deriveLanes(plan, { overwrite: false }) -- fills in `lane` on every module
// missing one (or every module, if overwrite:true). Mutates and returns plan.
export function deriveLanes(plan, { overwrite = false } = {}) {
  for (const m of plan.modules || []) {
    if (overwrite || !m.lane) {
      m.lane = deriveLane(m.write_scope);
    }
  }
  return plan;
}
