#!/usr/bin/env python3
"""
End-to-end agent behavior tests against local LLM.
Tests bpm-opencode-experts agent files as an end-user would experience them.

Usage:
  python3 test_agents.py                        # all tests, qwen3.6-35b-a3b
  python3 test_agents.py --model qwen3-coder-next
  python3 test_agents.py --test researcher      # single suite
"""
import argparse
import json
import sys
import time
from pathlib import Path

BASE_URL = "http://localhost:1234/v1/chat/completions"
AGENTS_DIR = Path(__file__).parent / "agents"
MODEL = "qwen/qwen3-coder-next"

# ── helpers ──────────────────────────────────────────────────────────────────

def read_agent(name: str) -> str:
    p = AGENTS_DIR / f"{name}.md"
    if not p.exists():
        raise FileNotFoundError(p)
    return p.read_text()

def read_shared(name: str) -> str:
    p = AGENTS_DIR / "shared" / f"{name}.md"
    return p.read_text() if p.exists() else ""

def call(system: str, user: str, model: str = MODEL, max_tokens: int = 1200,
         thinking: bool = False) -> tuple[str, float]:
    import urllib.request
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "stream": False,
    }
    if thinking:
        payload["thinking"] = {"type": "enabled", "budget_tokens": 800}

    data = json.dumps(payload).encode()
    req  = urllib.request.Request(BASE_URL, data=data,
                                  headers={"Content-Type": "application/json"})
    t0   = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        body = json.loads(r.read())
    elapsed = time.time() - t0
    text = body["choices"][0]["message"]["content"]
    return text, elapsed


# ── scoring ──────────────────────────────────────────────────────────────────

def check(resp: str, checks: dict[str, tuple[bool, str]]) -> list[tuple[str, bool, str]]:
    """checks: {label: (should_be_present, substring)}"""
    results = []
    for label, (want, needle) in checks.items():
        found = needle.lower() in resp.lower()
        passed = found if want else not found
        results.append((label, passed, needle))
    return results

def report(suite: str, results: list[tuple[str, bool, str]], resp: str, elapsed: float):
    print(f"\n{'='*60}")
    print(f"  {suite}  ({elapsed:.1f}s)")
    print(f"{'='*60}")
    passed = sum(1 for _, p, _ in results if p)
    total  = len(results)
    for label, ok, needle in results:
        icon = "✓" if ok else "✗"
        print(f"  {icon} {label}")
    print(f"\n  Score: {passed}/{total}")
    if passed < total:
        print(f"\n  --- Response excerpt (first 600 chars) ---")
        print(f"  {resp[:600].replace(chr(10), chr(10)+'  ')}")
    return passed, total


# ── test suites ──────────────────────────────────────────────────────────────

def test_sdlc_init_discovery(model):
    """
    sdlc-lead with sdlc-init-mode dispatcher.
    Simulate: state detection already ran and returned 'fresh' (no project yet).
    User wants to start a new TypeScript API project.
    Expected:
      - Runs discovery interview (asks questions)
      - Does NOT call task()
      - Does NOT load all phase files at once
    """
    system = read_agent("sdlc-lead") + "\n\n---\n" + read_agent("sdlc-init-mode")
    # Simulate the mandatory startup sequence having already run and returned 'fresh'
    user = (
        "[SDLC State Detection Result]\n"
        "scripts/detect-sdlc-state.sh output: {\"status\": \"fresh\"}\n"
        "docs/work/SDLC_AUDIT.md: not found\n"
        "docs/work/sdlc-state.md: not found\n\n"
        "User request: I want to build a new TypeScript REST API for task management. "
        "Let's get started with /sdlc init."
    )
    resp, elapsed = call(system, user, model=model, max_tokens=900)
    results = check(resp, {
        "Asks at least one discovery question":  (True,  "?"),
        "No bare task() call":                   (False, "task(agent="),
        "No loading Phase 3/4 files yet":        (False, "sdlc-init-phases-3-4"),
        "Doesn't immediately start coding":      (False, "write(filepath=\"src/"),
    })
    return report("sdlc-lead → init: discovery interview", results, resp, elapsed)


def test_sdlc_init_phase_load(model):
    """
    After discovery is confirmed, dispatcher should direct to sdlc-init-phases-0-2.
    Simulate multi-turn: state=fresh detected, discovery complete.
    """
    system = read_agent("sdlc-lead") + "\n\n---\n" + read_agent("sdlc-init-mode")
    user = (
        "[Context: State detection ran, returned 'fresh'. Discovery interview completed.]\n\n"
        "Discovery answers confirmed:\n"
        "- Building: TypeScript REST API for task management\n"
        "- Users: developers via REST\n"
        "- Stack: Node.js + Fastify + PostgreSQL\n"
        "- Timeline: 4 weeks to MVP\n\n"
        "DISCOVERY.md is written. State is 'fresh' (Mode 1). "
        "What is the next step and which file do you need to load?"
    )
    resp, elapsed = call(system, user, model=model, max_tokens=600)
    results = check(resp, {
        "References phases-0-2 file":      (True,  "phases-0-2"),
        "No task() call":                  (False, "task(agent="),
        "No loading Phase 3/4 file yet":   (False, "phases-3-4"),
        "Uses read() to load phase file":  (True,  "read("),
    })
    return report("sdlc-lead → init: phase file loading", results, resp, elapsed)


def test_handoff_format(model):
    """
    When sdlc-lead needs to delegate to researcher, does it emit ════ delimiters?
    """
    system = (read_agent("sdlc-lead") + "\n\n---\n" +
              read_agent("sdlc-init-mode") + "\n\n---\n" +
              read_shared("HANDOFF_QUICK_REF"))
    user   = (
        "We're in Phase 0. We need to research the competitive landscape for "
        "task management apps before writing VISION.md. Please delegate to the researcher."
    )
    resp, elapsed = call(system, user, model=model, max_tokens=1000)
    results = check(resp, {
        "Uses ════ delimiter":                (True,  "════"),
        "SDLC-TASK for researcher":           (True,  "sdlc-task for researcher"),
        "Has ROLE line":                      (True,  "role:"),
        "Has CONTEXT section":                (True,  "context"),
        "Has PRODUCE section":                (True,  "produce"),
        "Has completion phrase":              (True,  "print exactly"),
        "No bare task() call":               (False, "task(agent="),
        "Saves state first (sdlc-state.md)": (True,  "sdlc-state"),
    })
    return report("sdlc-lead → HANDOFF format", results, resp, elapsed)


def test_researcher_mode_quick(model):
    """
    Researcher should select QUICK LOOKUP for a simple factual question.
    """
    system = read_agent("researcher")
    user   = "What is the latest stable version of Fastify?"

    resp, elapsed = call(system, user, model=model, max_tokens=500)
    results = check(resp, {
        "Selects QUICK LOOKUP mode":       (True,  "quick"),
        "Does not plan 5 sub-questions":   (False, "q1:"),
        "States mode before searching":    (True,  "mode"),
        "No full 5-step loop overhead":    (False, "step 2.5"),
    })
    return report("researcher: QUICK LOOKUP mode selection", results, resp, elapsed)


def test_researcher_mode_comparison(model):
    """
    Researcher should select COMPARISON for A vs B question.
    """
    system = read_agent("researcher")
    user   = "Compare Fastify vs Express vs Hono for a new TypeScript REST API in 2026."

    resp, elapsed = call(system, user, model=model, max_tokens=600)
    results = check(resp, {
        "Selects COMPARISON mode":          (True,  "comparison"),
        "States mode before searching":     (True,  "mode"),
        "Plans comparison criteria":         (True,  "performance"),
        "Does not immediately deep-dive":   (False, "step 2.5"),
    })
    return report("researcher: COMPARISON mode selection", results, resp, elapsed)


def test_researcher_mode_deep(model):
    """
    Researcher should select DEEP DIVE for complex multi-Q research.
    """
    system = read_agent("researcher")
    user   = (
        "Research the current state of local LLM inference for production AI assistants in 2026 — "
        "models, hardware requirements, frameworks, latency benchmarks, and tradeoffs vs cloud APIs."
    )
    resp, elapsed = call(system, user, model=model, max_tokens=700)
    results = check(resp, {
        "Selects DEEP DIVE mode":          (True,  "deep"),
        "Defines 3-5 sub-questions":       (True,  "q1"),
        "States mode before searching":    (True,  "mode"),
        "Plans before searching":          (True,  "plan"),
    })
    return report("researcher: DEEP DIVE mode selection", results, resp, elapsed)


def test_researcher_no_task_discard(model):
    """
    Researcher is mid-research (Q1, pass 1). Tool result just returned.
    It should: write full source to checkpoint file, extract facts for active context.
    NOT just explain the process — actually do it.
    """
    system = read_agent("researcher")
    user   = (
        "Mode: DEEP DIVE\n"
        "Research plan:\n"
        "Q1: What ranking functions does SQLite FTS5 support?\n"
        "Q2: How do you tune BM25 weights?\n\n"
        "Q1 pass 1 — tool result just returned:\n"
        "web_research_pullmd result:\n"
        "[Source 1: https://sqlite.org/fts5.html]\n"
        "FTS5 supports BM25 via rank() function. Use ORDER BY rank. "
        "bm25() takes column weights. rank() returns negative values. "
        "FTS5 requires SQLite 3.9.0+.\n\n"
        "Process this tool result now. Write the checkpoint and extract the facts."
    )
    resp, elapsed = call(system, user, model=model, max_tokens=700)
    results = check(resp, {
        "Writes to checkpoint file (write call)": (True,  "write("),
        "References docs/work/research path":     (True,  "docs/work/research"),
        "Extracts key facts as bullets":           (True,  "bm25"),
        "Notes source URL":                        (True,  "sqlite.org"),
        "Does NOT say 'discard' the content":     (False, "discard"),
    })
    return report("researcher: checkpoint-write pattern (quality protection)", results, resp, elapsed)


def test_security_auditor_shell_only(model):
    """
    Security auditor should NOT load OWASP_METHODOLOGY for a quick check.
    """
    system = read_agent("security-auditor")
    user   = "Quick security review of this auth middleware — just flag obvious issues."

    resp, elapsed = call(system, user, model=model, max_tokens=600)
    results = check(resp, {
        "Does not load OWASP_METHODOLOGY": (False, "owasp_methodology"),
        "Stays in quick mode":             (True,  "quick"),
        "Uses shell execution rules":      (True,  "owasp"),
        "No task() call":                  (False, "task(agent="),
    })
    return report("security-auditor: shell-only for quick check", results, resp, elapsed)


def test_security_auditor_deep_load(model):
    """
    Security auditor --deep should direct to load OWASP_METHODOLOGY.
    """
    system = read_agent("security-auditor")
    user   = "Run a full --deep OWASP audit of this Node.js application."

    resp, elapsed = call(system, user, model=model, max_tokens=600)
    results = check(resp, {
        "References OWASP_METHODOLOGY.md": (True,  "owasp_methodology"),
        "Uses read() to load it":          (True,  "read("),
        "No task() call":                  (False, "task(agent="),
        "Checks context budget first":     (True,  "context"),
    })
    return report("security-auditor: --deep loads OWASP_METHODOLOGY", results, resp, elapsed)


def test_no_task_calls_in_responses(model):
    """
    sdlc-lead Mode 4: discovery complete, user confirms parallel audit fan-out.
    Simulate: state detected, discovery interview done, user says 'go'.
    Expected: emit 3 parallel HANDOFF blocks, no task() calls.
    """
    system = (read_agent("sdlc-lead") + "\n\n---\n" +
              read_agent("sdlc-improve-mode") + "\n\n---\n" +
              read_shared("HANDOFF_QUICK_REF"))
    user   = (
        "[Context: SDLC state detected = brownfield. Mode 4 selected. "
        "Improvement Discovery Interview completed. docs/IMPROVE_CONTEXT.md written.]\n\n"
        "Discovery confirmed:\n"
        "- Focus: code quality + security + performance\n"
        "- Scope: entire src/ directory\n"
        "- Tolerance: fix CRITICAL and HIGH, defer MEDIUM/LOW\n\n"
        "User says: 'yes, kick off all three audits in parallel now.'\n\n"
        "Emit the parallel HANDOFFs for Step 2 of the improvement workflow."
    )
    resp, elapsed = call(system, user, model=model, max_tokens=1000)
    results = check(resp, {
        "No bare task() call emitted":      (False, "task(agent="),
        "Emits ════ delimiters":            (True,  "════"),
        "Targets code-reviewer":            (True,  "code-reviewer"),
        "Targets security-auditor":         (True,  "security-auditor"),
        "Targets performance-engineer":     (True,  "performance-engineer"),
        "All in one message (parallel)":    (True,  "parallel"),
    })
    return report("sdlc-improve: parallel audit fan-out (no task())", results, resp, elapsed)


def test_review_skill(model):
    """
    /review skill should emit 3 parallel HANDOFF blocks, not task() calls.
    """
    from pathlib import Path
    skill_path = Path(__file__).parent / "skills" / "review" / "SKILL.md"
    system = skill_path.read_text()
    user   = "Review the changes in src/api/ directory."

    resp, elapsed = call(system, user, model=model, max_tokens=1200)
    results = check(resp, {
        "No task() call":                  (False, "task(agent="),
        "Emits ════ delimiters":           (True,  "════"),
        "HANDOFF to code-reviewer":        (True,  "code-reviewer"),
        "HANDOFF to security-auditor":     (True,  "security-auditor"),
        "HANDOFF to performance-engineer": (True,  "performance-engineer"),
        "Writes HANDOFF manifest":         (True,  "handoff_manifest"),
        "All in one message (parallel)":   (True,  "parallel"),
    })
    return report("/review skill: parallel HANDOFF blocks", results, resp, elapsed)


def test_git_expert_bounded(model):
    """
    git-expert receives a HANDOFF — should produce Completion Manifest with SHA.
    """
    system = read_agent("git-expert")
    user   = (
        "SDLC-TASK for git-expert:\n\n"
        "CONTEXT:\n- agents/shared/BOUNDED_TASK_CONTRACT.md\n\n"
        "YOUR TASK: Commit docs/VISION.md to branch sdlc/setup. "
        "Conventional commit: 'docs(phase-0): add vision document'. Push to origin.\n\n"
        "PRODUCE:\n- git commit + push\n\n"
        "Print exactly: \"git-expert done -- vision committed to sdlc/setup\"\n"
        "Then stop."
    )
    resp, elapsed = call(system, user, model=model, max_tokens=600)
    results = check(resp, {
        "Produces Completion Manifest":         (True,  "completion manifest"),
        "Lists commands run":                   (True,  "commands run"),
        "Notes branch/SHA":                     (True,  "branch"),
        "Prints exact completion phrase":       (True,  "git-expert done"),
        "No extra output after phrase":         (True,  "then stop"),
    })
    return report("git-expert: bounded task + completion manifest", results, resp, elapsed)


# ── main ─────────────────────────────────────────────────────────────────────

SUITES = {
    "sdlc_init_discovery": test_sdlc_init_discovery,
    "sdlc_init_phase_load": test_sdlc_init_phase_load,
    "handoff_format":       test_handoff_format,
    "researcher_quick":     test_researcher_mode_quick,
    "researcher_comparison":test_researcher_mode_comparison,
    "researcher_deep":      test_researcher_mode_deep,
    "researcher_checkpoint":test_researcher_no_task_discard,
    "security_quick":       test_security_auditor_shell_only,
    "security_deep":        test_security_auditor_deep_load,
    "improve_no_task":      test_no_task_calls_in_responses,
    "review_skill":         test_review_skill,
    "git_bounded":          test_git_expert_bounded,
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--test",  default=None, help="run single suite by name")
    args = parser.parse_args()

    print(f"\nModel: {args.model}")
    print(f"Base:  {BASE_URL}")

    suites = ({args.test: SUITES[args.test]} if args.test and args.test in SUITES
              else SUITES)

    total_p = total_t = 0
    for name, fn in suites.items():
        try:
            p, t = fn(args.model)
        except Exception as e:
            print(f"\n  [ERROR] {name}: {e}")
            p, t = 0, 1
        total_p += p
        total_t += t

    print(f"\n{'='*60}")
    print(f"  TOTAL: {total_p}/{total_t}  ({100*total_p//total_t}%)")
    print(f"{'='*60}\n")
    sys.exit(0 if total_p == total_t else 1)
