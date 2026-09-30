#!/usr/bin/env node
/**
 * edit-task-stub.mjs — scripted stand-in for an agent (Group K2 pipeline self-test; costs nothing).
 * STUB_MODE: solve (default) applies <taskdir>/solution over the workdir · noop does nothing · peek reads the hidden test path.
 * When the arm gates (EXPERTS_GATEGUARD=1) it mimics the plugin's logging: a deny row, a search, then the write.
 */
import { appendFileSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const { EDIT_WORKDIR: wd, EDIT_TASKDIR: td, STUB_MODE = "solve", EXPERTS_GATEGUARD, EXPERTS_GATEGUARD_LOG, EXPERTS_TRACE_LOG } = process.env;
let seq = 0;
const trace = (row) => EXPERTS_TRACE_LOG && appendFileSync(EXPERTS_TRACE_LOG, JSON.stringify({ seq: ++seq, ts: Date.now(), ...row }) + "\n");
if (STUB_MODE === "peek") trace({ tool: "bash", cmd: `cat ${join(td, "hidden", "test.mjs")}` });
if (STUB_MODE !== "noop" && existsSync(join(td, "solution"))) {
  if (EXPERTS_GATEGUARD === "1" && EXPERTS_GATEGUARD_LOG) {
    appendFileSync(EXPERTS_GATEGUARD_LOG, JSON.stringify({ ts: Date.now(), event: "gate_denied", file: "src/x.mjs", exists: true }) + "\n");
    trace({ tool: "grep", cmd: "importers of x" });
  }
  trace({ tool: "edit", file: "src/x.mjs" });
  cpSync(join(td, "solution"), wd, { recursive: true });
}
