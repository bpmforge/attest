/**
 * test-loop-antitamper.ts — Pass 59 (Group K3). goal/autopilot/wave must each
 * carry the anti-tamper boundary: a loop may not reach "done" by weakening the
 * check. Structural: the clause must sit inside the "## Boundaries" section.
 */
import * as fs from "fs";
import * as path from "path";

export function testLoopAntiTamper(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): void {
  for (const skill of ["goal", "autopilot", "wave"]) {
    const src = fs.readFileSync(path.join(root, "skills", skill, "SKILL.md"), "utf8");
    const m = src.match(/^## Boundaries\n([\s\S]*?)(?=\n## |(?![\s\S]))/m);
    const label = `K3 anti-tamper — skills/${skill} Boundaries forbids weakening tests/config/acceptance`;
    const body = m?.[1] ?? "";
    if (/anti-tamper/i.test(body) && /weakening a test/.test(body) && /acceptance check/.test(body)) ok(label);
    else fail(label, m ? "clause missing from Boundaries" : "no Boundaries section");
  }
}
