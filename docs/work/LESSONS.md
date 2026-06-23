# Lessons — auto-captured from loop escalations

One row per loop failure. `loop-learn.mjs` appends here; `/steward` distills these into the
canonical CLAUDE.md / skills / exemplars instead of cold-starting.

| When | Source | Symptom | Root cause | Rule (do this next time) |
|------|--------|---------|------------|--------------------------|
| 2026-06-23T00:37:26.638Z | anti-drift:wave1 | nearly shipped a redundant/looser (400) file-size gate beside an existing one because an explore agent reported validate-code-health H-02 as 'advisory' | trusted an agent's audit claim ('H-02 advisory') without reading the source; H-02 actually uses gap() = blocking at 250 | an agent's claim that an existing gate is 'advisory/missing' MUST be confirmed by reading the source (grep for gap/exit) before building a parallel mechanism — this is the same perception-drift the anti-drift work targets |
