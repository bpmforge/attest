// handoff-emit.test.mjs — the HANDOFF pointer emitter + linter.
//
// Field complaint (2026-10-21): the SDLC lead's handoff "prints wrong" and
// "repeats the info three times". Root causes: the pointer was TYPED into a
// markdown-rendered reply (lines collapse), and the HANDOFF body was echoed in
// prose on top of being written to its file, the packet and the ledger. The
// emitter prints the pointer as a tool result and refuses to point at a file
// that would not work. These cases pin both directions. Discovered and run by
// Pass 53 (scripts/test-conductor-suite.ts) like every *.test.mjs under scripts/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'handoff-emit.sh');

function run(root, args) {
  try {
    return { code: 0, out: execFileSync('bash', [SCRIPT, ...args, '--root', root], { encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'handoff-emit-'));
  mkdirSync(resolve(root, 'docs/work'), { recursive: true });
  mkdirSync(resolve(root, 'skills/code'), { recursive: true });
  writeFileSync(resolve(root, 'skills/code/SKILL.md'), '---\nname: code\n---\nLoad and follow the instructions in the `coding-agent` agent.\n');
  return root;
}

const GOOD = `════════════════════════════════════════════════════════════
HANDOFF → coding-agent   (open /code and read this file)
════════════════════════════════════════════════════════════
SDLC-TASK for coding-agent:

CONTEXT (read these before starting):
- docs/work/context-for-coding-agent.md

WRITE-SCOPE (exclusive):
- src/auth/

YOUR TASK:
Implement refresh-token rotation as described in the context packet.

PRODUCE exactly these files (nothing else):
- src/auth/refresh.ts
- docs/reviews/MANIFEST_coding-agent_auth-refresh.md

When all files are written, print exactly:
"coding-agent done -- refresh rotation implemented"
Then stop.
════════════════════════════════════════════════════════════
END HANDOFF #3
════════════════════════════════════════════════════════════
`;

test('emitter: a well-formed HANDOFF yields ONE pointer whose paste line starts with the intake trigger', () => {
  const root = fixture();
  try {
    writeFileSync(resolve(root, 'docs/work/HANDOFF_coding-agent.md'), GOOD);
    // The skill lookup walks SCRIPT_DIR/../skills first; the fixture's skills/
    // dir is the fallback, so pass --skill explicitly to keep the test hermetic.
    const r = run(root, ['coding-agent', '--skill', '/code']);
    assert.equal(r.code, 0, r.out);
    assert.equal((r.out.match(/── NEXT HANDOFF ──/g) || []).length, 1, 'exactly one pointer');
    assert.match(r.out, /^\s{4}SDLC-TASK for coding-agent: read docs\/work\/HANDOFF_coding-agent\.md and execute it\.$/m);
    assert.match(r.out, /It produces:\s+docs\/reviews\/MANIFEST_coding-agent_auth-refresh\.md/);
    assert.doesNotMatch(r.out, /YOUR TASK:/, 'the body is never printed');
    assert.match(r.out, /ledger .* not written yet/, 'a missing ledger is named, not fatal');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('emitter: a slugged HANDOFF resolves its own file and does not ask for a ledger that exists', () => {
  const root = fixture();
  try {
    writeFileSync(resolve(root, 'docs/work/HANDOFF_coding-agent-auth.md'), GOOD);
    writeFileSync(resolve(root, 'docs/work/TASKS_coding-agent-auth.md'), '- [ ] implement\n');
    const r = run(root, ['coding-agent', 'auth', '--skill', '/code']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /read docs\/work\/HANDOFF_coding-agent-auth\.md/);
    assert.doesNotMatch(r.out, /not written yet/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('linter: template leakage, USER: lines inside the delimiters, an unbalanced fence and a missing stop are each refused by name', () => {
  const root = fixture();
  try {
    writeFileSync(resolve(root, 'docs/work/HANDOFF_coding-agent.md'), `════════════════════════════════════════════════════════════
HANDOFF → <agent-name>
════════════════════════════════════════════════════════════
SDLC-TASK for coding-agent:
USER: open a new session and paste everything below
PRODUCE exactly these files (nothing else):
- src/x.ts
\`\`\`verify
npm test
[Code tasks only] Runnable verify commands go in the packet
When all files are written, print exactly: "coding-agent done -- x"
════════════════════════════════════════════════════════════
END HANDOFF #N
════════════════════════════════════════════════════════════
`);
    const r = run(root, ['coding-agent', '--skill', '/code']);
    assert.equal(r.code, 1, 'lint gaps must exit 1');
    assert.match(r.out, /^HANDOFF-LINT: \d+ gap/m);
    assert.doesNotMatch(r.out, /── NEXT HANDOFF ──/, 'no pointer to a broken file');
    for (const needle of ['USER:-addressed line sits INSIDE', 'unbalanced code fence', "missing 'Then stop'", "'<agent-name>'", "'[Code tasks only]'", "'END HANDOFF #N'"]) {
      assert.ok(r.out.includes(needle), `expected gap mentioning ${needle}\n${r.out}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('linter: a missing file and a missing intake trigger are refused', () => {
  const root = fixture();
  try {
    let r = run(root, ['coding-agent', '--skill', '/code']);
    assert.equal(r.code, 1);
    assert.match(r.out, /file missing or empty/);
    writeFileSync(resolve(root, 'docs/work/HANDOFF_coding-agent.md'), GOOD.replace('SDLC-TASK for coding-agent:', 'Task for coding-agent:'));
    r = run(root, ['coding-agent', '--skill', '/code']);
    assert.equal(r.code, 1);
    assert.match(r.out, /no 'SDLC-TASK for coding-agent:' line/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('linter: --lint-only reports clean without printing a pointer; the size cap fires on template-sized files', () => {
  const root = fixture();
  try {
    writeFileSync(resolve(root, 'docs/work/HANDOFF_coding-agent.md'), GOOD);
    let r = run(root, ['coding-agent', '--lint-only']);
    assert.equal(r.code, 0);
    assert.match(r.out, /HANDOFF-LINT: clean/);
    assert.doesNotMatch(r.out, /NEXT HANDOFF/);
    const padded = GOOD.replace('Then stop.\n', `Then stop.\n${'- filler line\n'.repeat(230)}`);
    writeFileSync(resolve(root, 'docs/work/HANDOFF_coding-agent.md'), padded);
    r = run(root, ['coding-agent', '--lint-only']);
    assert.equal(r.code, 1);
    assert.match(r.out, /lines \(cap 220\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
