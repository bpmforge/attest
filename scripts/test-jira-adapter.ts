/**
 * test-jira-adapter.ts — chapter module for scripts/test.ts (Jira DC adapter).
 *
 * Covers scripts/jira/jira.mjs + scripts/lib/lifecycle-outbox.mjs against a
 * MOCKED Jira (an injected fetchImpl) — no live instance. Proves the design
 * guarantees in docs/DESIGN_JIRA_ADAPTER.md:
 *   1. Graceful fallback — no JIRA_BASE_URL ⇒ config disabled, outbox append is
 *      a no-op, lifecycle verbs untouched.
 *   2. Idempotent sync-plan — a second sync issues ZERO POSTs (JQL finds the
 *      existing issue); epic link + blocking link created from depends_on.
 *   3. Guards — claim refuses an Epic; claim refuses a cross-assigned issue;
 *      accept refuses when the Jira assignee == acceptor (maker≠verifier).
 *   4. close-epic refused while any child is not Done.
 *   5. Durable outbox — a 503 on a mirror leaves the op PENDING; reconcile
 *      drains it; replaying twice is a no-op (idempotent ack).
 *   6. pull output validates against the TrackerItem schema (tracker-model.mjs).
 *
 * Run on real node --experimental-strip-types via scripts/test.ts.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import {
  resolveConfig,
  JiraClient,
  syncPlan,
  findIssueByPlanId,
  closeEpic,
  pull,
  drainOutbox,
  loadPlanAt,
  verbs,
} from "./jira/jira.mjs";
import {
  backendConfigured,
  appendOutbox,
  pendingOps,
} from "./lib/lifecycle-outbox.mjs";
import {
  validateTrackerSnapshot,
  parseTrackerSpec,
} from "./lib/tracker-model.mjs";

type OK = (label: string) => void;
type FAIL = (label: string, reason: string) => void;

// ── Mock Jira: an in-memory issue store behind a fetch(url, init) impl ───────
interface MockOpts {
  failNextPost?: number; // return 503 for the next N POSTs (for outbox test)
}
function makeMockJira(seed: any = {}, opts: MockOpts = {}) {
  const issues: Record<string, any> = { ...seed };
  const calls: { method: string; path: string; body?: any }[] = [];
  let idSeq = 100;
  let failPosts = opts.failNextPost || 0;

  function res(status: number, bodyObj: any) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (bodyObj === undefined ? "" : JSON.stringify(bodyObj)),
    };
  }

  const fetchImpl = async (url: string, init: any) => {
    const u = new URL(url);
    const p = u.pathname.replace(/^\/rest\/api\/[23]/, "");
    const method = init.method;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: p, body });

    // search
    if (method === "GET" && p === "/search") {
      const jql = decodeURIComponent(u.searchParams.get("jql") || "");
      const m = jql.match(/labels = "(plan-id:[^"]+)"/);
      let matched = Object.values(issues);
      if (m)
        matched = matched.filter((i: any) =>
          (i.fields.labels || []).includes(m[1]),
        );
      const epicM = jql.match(/"Epic Link" = (\S+)/);
      if (epicM)
        matched = matched.filter(
          (i: any) =>
            i.fields.customfield_10014 === epicM[1] ||
            i.fields.parent?.key === epicM[1],
        );
      return res(200, { issues: matched });
    }
    // getIssue
    if (method === "GET" && /^\/issue\/[^/]+$/.test(p)) {
      const key = p.split("/")[2];
      return issues[key]
        ? res(200, issues[key])
        : res(404, { errorMessages: ["gone"] });
    }
    // transitions list
    if (method === "GET" && /\/transitions$/.test(p)) {
      return res(200, {
        transitions: [
          { id: "11", name: "To Do", to: { name: "To Do" } },
          {
            id: "21",
            name: "Selected for Development",
            to: { name: "Selected for Development" },
          },
          { id: "31", name: "In Progress", to: { name: "In Progress" } },
          { id: "41", name: "In Review", to: { name: "In Review" } },
          { id: "51", name: "Done", to: { name: "Done" } },
        ],
      });
    }
    if (method === "POST" && /\/transitions$/.test(p)) {
      const key = p.split("/")[2];
      const map: Record<string, string> = {
        "11": "To Do",
        "21": "Selected for Development",
        "31": "In Progress",
        "41": "In Review",
        "51": "Done",
      };
      if (issues[key])
        issues[key].fields.status = { name: map[body.transition.id] };
      return res(204, undefined);
    }
    // createIssue
    if (method === "POST" && p === "/issue") {
      if (failPosts > 0) {
        failPosts--;
        return res(503, { errorMessages: ["service unavailable"] });
      }
      const key = `PROJ-${idSeq++}`;
      issues[key] = {
        key,
        fields: { ...body.fields, status: { name: "To Do" }, issuelinks: [] },
      };
      return res(201, { key });
    }
    // updateIssue (epic link)
    if (method === "PUT" && /^\/issue\/[^/]+$/.test(p)) {
      const key = p.split("/")[2];
      if (issues[key])
        issues[key].fields = { ...issues[key].fields, ...body.fields };
      return res(204, undefined);
    }
    // assignee
    if (method === "PUT" && /\/assignee$/.test(p)) {
      const key = p.split("/")[2];
      if (issues[key])
        issues[key].fields.assignee = body.name ? { name: body.name } : null;
      return res(204, undefined);
    }
    // comment
    if (method === "POST" && /\/comment$/.test(p)) {
      if (failPosts > 0) {
        failPosts--;
        return res(503, { errorMessages: ["service unavailable"] });
      }
      return res(201, { id: "1" });
    }
    // issueLink
    if (method === "POST" && p === "/issueLink") {
      const inKey = body.inwardIssue.key,
        outKey = body.outwardIssue.key;
      if (issues[inKey])
        (issues[inKey].fields.issuelinks ||= []).push({
          type: { name: body.type.name },
          outwardIssue: { key: outKey },
        });
      if (issues[outKey])
        (issues[outKey].fields.issuelinks ||= []).push({
          type: { name: body.type.name },
          inwardIssue: { key: inKey },
        });
      return res(201, {});
    }
    if (method === "GET" && p === "/field")
      return res(200, [{ id: "customfield_10014", name: "Epic Link" }]);
    if (method === "GET" && p === "/status")
      return res(200, [
        { name: "To Do" },
        { name: "Selected for Development" },
        { name: "In Progress" },
        { name: "In Review" },
        { name: "Done" },
      ]);
    return res(400, { errorMessages: [`unhandled ${method} ${p}`] });
  };
  return { fetchImpl, issues, calls };
}

const ENV = {
  JIRA_BASE_URL: "https://jira.test",
  JIRA_TOKEN: "pat",
  JIRA_PROJECT: "PROJ",
  __JIRA_FAKE_TS: "2026-07-14T00:00:00Z",
};

function writePlan(dir: string, modules: any[]) {
  const p = path.join(dir, "plan.json");
  fs.writeFileSync(p, JSON.stringify({ goal: "test", modules }, null, 2));
  return p;
}

export async function testJiraAdapter(_root: string, ok: OK, fail: FAIL) {
  console.log("\n[Pass 40] Jira adapter — mocked REST");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jira-test-"));
  const cfg = resolveConfig(ENV as any);

  // 1. Graceful fallback
  try {
    const disabled = resolveConfig({} as any);
    const outboxWritten = appendOutbox(
      path.join(tmp, "plan.json"),
      { verb: "claim", planId: "M-x" },
      {} as any,
    );
    if (
      !disabled.enabled &&
      backendConfigured(ENV as any) &&
      !backendConfigured({} as any) &&
      outboxWritten === false
    )
      ok(
        "fallback: no JIRA_BASE_URL ⇒ config disabled + outbox append is a no-op",
      );
    else
      fail(
        "fallback",
        `disabled=${disabled.enabled} outboxWritten=${outboxWritten}`,
      );
  } catch (e: any) {
    fail("fallback", e.message);
  }

  // 2. Idempotent sync-plan + links
  try {
    const modules = [
      {
        id: "E1",
        kind: "epic",
        epic: true,
        title: "Epic One",
        lane: "frontend",
        write_scope: ["src/ui/"],
        depends_on: [],
        acceptance: ["x"],
      },
      {
        id: "M-a",
        kind: "module",
        title: "A",
        lane: "frontend",
        epic_parent: "E1",
        write_scope: ["src/ui/a/"],
        depends_on: [],
        acceptance: ["a"],
        stories: ["US-1"],
      },
      {
        id: "M-b",
        kind: "module",
        title: "B",
        lane: "backend",
        write_scope: ["src/api/b/"],
        depends_on: ["M-a"],
        acceptance: ["b"],
      },
    ];
    const planPath = writePlan(tmp, modules);
    const mock = makeMockJira();
    const client = new JiraClient(cfg, mock.fetchImpl);
    const plan = loadPlanAt(planPath);
    const r1 = await syncPlan(plan, client);
    const posts1 = mock.calls.filter(
      (c) => c.method === "POST" && c.path === "/issue",
    ).length;
    const links = mock.calls.filter((c) => c.path === "/issueLink").length;
    // second sync: reload from disk (jira_key now persisted)
    const plan2 = loadPlanAt(planPath);
    const mock2calls0 = mock.calls.length;
    const r2 = await syncPlan(plan2, client);
    const posts2 = mock.calls
      .slice(mock2calls0)
      .filter((c) => c.method === "POST" && c.path === "/issue").length;
    if (posts1 === 3 && links === 1 && posts2 === 0 && r1.linked.length === 1)
      ok(
        "sync-plan: 3 issues created, 1 blocking link (M-a blocks M-b), second sync is 0 POSTs (idempotent)",
      );
    else
      fail(
        "sync-plan idempotency",
        `posts1=${posts1} links=${links} posts2=${posts2}`,
      );
  } catch (e: any) {
    fail("sync-plan", e.message + "\n" + e.stack);
  }

  // 3a. claim refuses an Epic
  try {
    const modules = [
      {
        id: "E1",
        kind: "epic",
        epic: true,
        title: "Epic",
        lane: "frontend",
        write_scope: ["src/"],
        depends_on: [],
        acceptance: ["x"],
        status: "ready",
        owner: null,
        jira_key: "PROJ-100",
      },
    ];
    const planPath = writePlan(makeDir(tmp, "e"), modules);
    const mock = makeMockJira({
      "PROJ-100": {
        key: "PROJ-100",
        fields: {
          issuetype: { name: "Epic" },
          assignee: null,
          status: { name: "To Do" },
        },
      },
    });
    const client = new JiraClient(cfg, mock.fetchImpl);
    const r = await verbs.claim(planPath, "PROJ-100", "brad", { client });
    if (!r.ok && /Epic/.test(r.error)) ok("guard: claim on an Epic is refused");
    else fail("claim-epic guard", JSON.stringify(r));
  } catch (e: any) {
    fail("claim-epic guard", e.message);
  }

  // 3b. claim refuses a cross-assigned issue
  try {
    const d = makeDir(tmp, "x");
    const modules = [
      {
        id: "M-a",
        kind: "module",
        title: "A",
        lane: "frontend",
        write_scope: ["src/a/"],
        depends_on: [],
        acceptance: ["a"],
        status: "ready",
        owner: null,
        jira_key: "PROJ-101",
      },
    ];
    const planPath = writePlan(d, modules);
    const mock = makeMockJira({
      "PROJ-101": {
        key: "PROJ-101",
        fields: {
          issuetype: { name: "Story" },
          assignee: { name: "alice" },
          status: { name: "To Do" },
        },
      },
    });
    const client = new JiraClient(cfg, mock.fetchImpl);
    const r = await verbs.claim(planPath, "PROJ-101", "brad", { client });
    if (!r.ok && /cross-surface/.test(r.error))
      ok(
        "guard: claim on a Jira-assigned issue is refused (cross-surface double-grab)",
      );
    else fail("cross-grab guard", JSON.stringify(r));
  } catch (e: any) {
    fail("cross-grab guard", e.message);
  }

  // 3c. accept refuses maker==verifier (Jira assignee == acceptor)
  try {
    const d = makeDir(tmp, "mv");
    const modules = [
      {
        id: "M-a",
        kind: "module",
        title: "A",
        lane: "frontend",
        write_scope: ["src/a/"],
        depends_on: [],
        acceptance: ["a"],
        status: "in_review",
        owner: "brad",
        jira_key: "PROJ-102",
      },
    ];
    const planPath = writePlan(d, modules);
    const mock = makeMockJira({
      "PROJ-102": {
        key: "PROJ-102",
        fields: {
          issuetype: { name: "Story" },
          assignee: { name: "brad" },
          status: { name: "In Review" },
        },
      },
    });
    const client = new JiraClient(cfg, mock.fetchImpl);
    const r = await verbs.accept(planPath, "PROJ-102", "brad", { client });
    if (!r.ok && /maker≠verifier/.test(r.error))
      ok(
        "guard: accept refused when Jira assignee == acceptor (maker≠verifier)",
      );
    else fail("maker-verifier guard", JSON.stringify(r));
  } catch (e: any) {
    fail("maker-verifier guard", e.message);
  }

  // 4. close-epic refused with an open child
  try {
    const mock = makeMockJira({
      "PROJ-100": {
        key: "PROJ-100",
        fields: { status: { name: "To Do" }, issuetype: { name: "Epic" } },
      },
      "PROJ-101": {
        key: "PROJ-101",
        fields: { status: { name: "Done" }, customfield_10014: "PROJ-100" },
      },
      "PROJ-102": {
        key: "PROJ-102",
        fields: {
          status: { name: "In Progress" },
          customfield_10014: "PROJ-100",
        },
      },
    });
    const client = new JiraClient(cfg, mock.fetchImpl);
    const r = await closeEpic(client, "PROJ-100");
    if (!r.ok && r.openKeys?.includes("PROJ-102"))
      ok("close-epic: refused while a child is not Done");
    else fail("close-epic guard", JSON.stringify(r));
    // and allowed when all children Done
    mock.issues["PROJ-102"].fields.status = { name: "Done" };
    const r2 = await closeEpic(client, "PROJ-100");
    if (r2.ok && r2.closed === 2)
      ok("close-epic: allowed once every child is Done");
    else fail("close-epic allow", JSON.stringify(r2));
  } catch (e: any) {
    fail("close-epic", e.message);
  }

  // 5. durable outbox: 503 on mirror ⇒ pending; reconcile drains; replay no-op
  try {
    const d = makeDir(tmp, "outbox");
    const modules = [
      {
        id: "M-a",
        kind: "module",
        title: "A",
        lane: "frontend",
        write_scope: ["src/a/"],
        depends_on: [],
        acceptance: ["a"],
        status: "ready",
        owner: null,
        jira_key: "PROJ-103",
      },
    ];
    const planPath = writePlan(d, modules);
    // comment verb mirrors via addComment (POST /comment). Fail the first POST.
    const mock = makeMockJira(
      {
        "PROJ-103": {
          key: "PROJ-103",
          fields: {
            issuetype: { name: "Story" },
            assignee: null,
            status: { name: "To Do" },
          },
        },
      },
      { failNextPost: 1 },
    );
    const client = new JiraClient(cfg, mock.fetchImpl);
    // Emit a comment event directly to the outbox (simulating a verb), then drain.
    appendOutbox(
      planPath,
      {
        verb: "comment",
        planId: "M-a",
        jiraKey: "PROJ-103",
        actor: "brad",
        note: "hi",
      },
      ENV as any,
    );
    const before = pendingOps(planPath).length;
    const plan = loadPlanAt(planPath);
    const d1 = await drainOutbox(client, plan, planPath, ENV as any); // POST fails → still pending
    const afterFail = pendingOps(planPath).length;
    const d2 = await drainOutbox(client, plan, planPath, ENV as any); // retry succeeds
    const afterOk = pendingOps(planPath).length;
    const d3 = await drainOutbox(client, plan, planPath, ENV as any); // replay: nothing pending
    if (
      before === 1 &&
      d1.failed.length === 1 &&
      afterFail === 1 &&
      d2.drained.length === 1 &&
      afterOk === 0 &&
      d3.drained.length === 0
    )
      ok(
        "outbox: 503 leaves op pending, reconcile retries to success, replay is a no-op",
      );
    else
      fail(
        "outbox drain",
        `before=${before} d1fail=${d1.failed.length} afterFail=${afterFail} d2ok=${d2.drained.length} afterOk=${afterOk} d3=${d3.drained.length}`,
      );
  } catch (e: any) {
    fail("outbox drain", e.message + "\n" + e.stack);
  }

  // 6. pull → TrackerItem snapshot validates against tracker-model
  try {
    const mock = makeMockJira({
      "PROJ-100": {
        key: "PROJ-100",
        fields: {
          summary: "Epic",
          issuetype: { name: "Epic" },
          labels: ["plan-id:E1"],
          status: { name: "To Do" },
        },
      },
      "PROJ-101": {
        key: "PROJ-101",
        fields: {
          summary: "Story A",
          issuetype: { name: "Story" },
          labels: ["plan-id:M-a"],
          status: { name: "To Do" },
          customfield_10014: "PROJ-100",
        },
      },
    });
    const client = new JiraClient(cfg, mock.fetchImpl);
    const snap = await pull(client);
    const specMd = [
      "# Tracker Data Model",
      "",
      "## Layer Map",
      "- `epic`",
      "- `story`",
      "",
      "## Phase → Work Linkage",
      "parentId",
      "",
      "## Source of Truth",
      "status field",
      "",
      "## Completion Rule",
      "all children done",
    ].join("\n");
    const spec = parseTrackerSpec(specMd);
    const { errors } = validateTrackerSnapshot(spec, snap);
    if (
      snap.sourceTracker === "jira" &&
      snap.items.length === 2 &&
      snap.items[1].parentId === "PROJ-100" &&
      errors.length === 0
    )
      ok(
        "pull: emits a valid TrackerItem snapshot (parentId from Epic Link, 0 integrity errors)",
      );
    else
      fail(
        "pull snapshot",
        `items=${snap.items.length} err=${JSON.stringify(errors)}`,
      );
  } catch (e: any) {
    fail("pull snapshot", e.message + "\n" + e.stack);
  }

  // 7. validate-jira-hygiene.sh — skips clean with no backend; flags gaps with
  //    TRACKER_BACKEND=jira (also wires the validator into the npm-test chain).
  try {
    const d = makeDir(tmp, "gate");
    fs.mkdirSync(path.join(d, "docs", "work"), { recursive: true });
    const planPath = path.join(d, "docs", "work", "plan.json");
    fs.writeFileSync(
      planPath,
      JSON.stringify(
        {
          goal: "t",
          modules: [
            {
              id: "M-a",
              kind: "module",
              title: "A",
              lane: "frontend",
              owner: "brad",
              status: "done",
              write_scope: ["src/a/"],
              depends_on: [],
              acceptance: ["a"],
            },
          ],
        },
        null,
        2,
      ),
    );
    const val = path.join(
      _root,
      "scripts",
      "validators",
      "validate-jira-hygiene.sh",
    );
    // no backend → skip clean (exit 0)
    let skipExit = 0;
    try {
      execFileSync("bash", [val, d], {
        env: { ...process.env, TRACKER_BACKEND: "none" },
        encoding: "utf8",
      });
    } catch (e: any) {
      skipExit = e.status;
    }
    // backend=jira, unsynced done module → gap (exit 1)
    let gapExit = 0,
      gapOut = "";
    try {
      gapOut = execFileSync("bash", [val, d], {
        env: {
          ...process.env,
          TRACKER_BACKEND: "jira",
          JIRA_BASE_URL: "https://x",
        },
        encoding: "utf8",
      });
    } catch (e: any) {
      gapExit = e.status;
      gapOut = (e.stdout || "") + (e.stderr || "");
    }
    if (skipExit === 0 && gapExit === 1 && /unsynced-module/.test(gapOut))
      ok(
        "validate-jira-hygiene.sh: skips clean with no backend, flags unsynced-module under TRACKER_BACKEND=jira",
      );
    else
      fail(
        "jira-hygiene validator",
        `skipExit=${skipExit} gapExit=${gapExit} out=${gapOut.slice(0, 200)}`,
      );
  } catch (e: any) {
    fail("jira-hygiene validator", e.message);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
}

// helper: writePlan overload used a stray 3-arg call above; normalize here.
function makeDir(base: string, name: string): string {
  const d = path.join(base, name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
