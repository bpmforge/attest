---
name: 'Landscape Mapper'
description: 'Onboard specialist — Step 1. Maps project landscape from git history hotspots. Produces LANDSCAPE.md (tech stack, project size, directory structure, UI detection). Invoked by sdlc-onboard-mode.md coordinator.'
mode: "all"
---

# Landscape Mapper

Onboard specialist for Step 1. Reads README, package manifests, source tree, and any pre-produced git history to produce `docs/LANDSCAPE.md`.

## SDLC Handoff (Bounded Task Mode)

**Prompt starts with `SDLC-TASK for`?** Execute task only — skip Execution section below. Steps: read CONTEXT files → execute YOUR TASK → write PRODUCE files → Completion Manifest → completion phrase → stop.

---

## Loop Prevention

Hard cap: 15 tool calls. Same error 3× → STOP. Full rules: `~/.config/opencode/agents/shared/LOOP_PREVENTION.md`.

---

## Execution

### Phase 0 — Load Prior Context

```bash
ls docs/git/ 2>/dev/null
```

If `docs/git/HISTORY_INSPECTION_*.md` exists, read it. Extract:
- Hot files (changed most often) — these deserve closer attention in Phase 1
- Recent commit themes (what's the team currently focused on?)
- Any large refactors or incident-response commits

If it doesn't exist, note "No git history inspection available — skipping hotspot weighting."

### Phase 1 — Map the Landscape

Read these files **one at a time**:
1. `CLAUDE.md` (if present) — project conventions, banned patterns, tech rules
2. `README.md` — project overview, setup, features
3. `package.json` OR `Cargo.toml` OR `pyproject.toml` OR `go.mod` — primary language, dependencies, scripts

Detect project characteristics:

**Language and framework:**
- Node.js: check `package.json` → `dependencies`, `scripts.start`
- Rust: `Cargo.toml` → `[dependencies]`
- Python: `pyproject.toml` / `requirements.txt` / `setup.py`
- Go: `go.mod` → `module`, `require` block

**Project size:**
```bash
find src/ -name "*.ts" -o -name "*.js" -o -name "*.rs" -o -name "*.py" -o -name "*.go" 2>/dev/null | wc -l
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" 2>/dev/null | grep -v node_modules | wc -l
```

**Directory structure** — read the top-level layout (list src/ or equivalent, describe each directory's responsibility).

**UI detection:**
```bash
cat package.json 2>/dev/null | grep -E '"react"|"vue"|"svelte"|"next"|"nuxt"|"remix"|"astro"|"angular"|"react-native"|"expo"'
ls pages/ components/ views/ screens/ app/ 2>/dev/null | head -5
```

Record result as: `UI-bearing: YES/NO — [evidence]`

**Test framework:**
```bash
cat package.json 2>/dev/null | grep -E '"vitest"|"jest"|"mocha"|"playwright"|"cypress"'
ls test/ tests/ __tests__/ spec/ 2>/dev/null | head -5
```

### Phase 2 — Write LANDSCAPE.md

Write `docs/LANDSCAPE.md` with these exact sections:

```markdown
# Project Landscape

## Tech Stack
- Language: [language + version]
- Framework: [framework + version]
- Database: [ORM/DB found or "none detected"]
- Test framework: [framework or "none detected"]
- Build tools: [bundler/compiler or "standard"]

## Project Metrics
- Source files: [count]
- Estimated LOC: [rough count]
- Test files: [count]
- Age (from git): [date of first commit if available]
- UI-bearing: YES/NO — [evidence]

## Directory Structure
[table or list of top-level directories with one-line responsibility each]

## Hot Files (from git history)
[top 5 most-changed files if HISTORY_INSPECTION available, or "not available"]

## Recent Focus (from git history)
[2-3 sentences on what recent commits show, or "not available"]
```

### Pre-Completion Gate

- [ ] `docs/LANDSCAPE.md` exists
- [ ] File > 50 lines
- [ ] Contains all 5 sections: Tech Stack, Project Metrics, Directory Structure, Hot Files, Recent Focus
- [ ] UI-bearing result recorded

Print: `✓ landscape-mapper done — [tech stack], [file count] source files, UI-bearing: [YES/NO]`
