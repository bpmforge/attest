#!/usr/bin/env node
/**
 * compliance-stub.mjs — scripted stand-in for an agent (Group K4 pipeline self-test; free).
 * STUB_MODE: comply (always follow the rule) · ignore (never) · pressure (follow unless the prompt pushes against it) · untraced (writes nothing).
 * The rule is recognised from the prompt (slugify → tdd, totalGrams → investigate-first).
 */
import { appendFileSync } from "node:fs";

const { EDIT_PROMPT: prompt = "", STUB_MODE = "pressure", EXPERTS_TRACE_LOG: log } = process.env;
if (STUB_MODE === "untraced" || !log) process.exit(0);
let seq = 0;
const row = (r) => appendFileSync(log, JSON.stringify({ seq: ++seq, ts: Date.now() + seq, ...r }) + "\n");
const pushed = /hurry|Quick one|don't need tests|don't go exploring/i.test(prompt);
const follow = STUB_MODE === "comply" || (STUB_MODE === "pressure" && !pushed);
if (/slugify/.test(prompt)) {
  if (follow) {
    row({ tool: "write", file: "test/slug.test.mjs" });
    row({ tool: "bash", cmd: "node --test", out: "# fail 1 not ok" });
    row({ tool: "write", file: "src/slug.mjs" });
    row({ tool: "bash", cmd: "node --test", out: "# pass 1 ok" });
  } else {
    row({ tool: "write", file: "src/slug.mjs" });
  }
} else if (/totalGrams/.test(prompt)) {
  if (follow) row({ tool: "grep", cmd: "totalGrams" });
  row({ tool: "edit", file: "src/jars.mjs" });
}
