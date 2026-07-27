#!/usr/bin/env node
/**
 * review-packet.mjs — make a senior reviewer's two hours count.
 *
 * A senior engineer offered to review an AI-built codebase and estimated ~1 month
 * of ramp-up before he could shift from learning to checking. That estimate is why
 * he is unavailable, and it is correct: "go read the repo" is not a reviewable ask
 * for someone joining cold, however willing they are.
 *
 * The alternative is not "review everything" or "review nothing". It is a bounded
 * packet — one slice of change, with the context needed to judge it and nothing
 * else — sized for a single sitting. That is the same HANDOFF discipline already
 * used for every AI specialist, addressed to a human instead.
 *
 * What it deliberately includes, because a diff alone is not reviewable:
 *   - the diffstat first, so the reviewer can decide where to spend attention
 *   - which files are NEW vs modified (new files carry the pattern decisions)
 *   - directory names with no precedent, which is where drift enters
 *   - the verification receipts covering the range, so "does it pass" is already
 *     answered and the human time goes to what only a human can judge
 *   - explicit questions, so the packet asks for a judgement rather than approval
 *
 *   node review-packet.mjs --range=abc123..HEAD [--out=docs/work/REVIEW_PACKET.md]
 *   node review-packet.mjs --since="2 weeks ago"
 */
import { writeFileSync, existsSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const ROOT = process.cwd();
const sh = (cmd, fb = "") => {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return fb;
  }
};

if (!sh("git rev-parse --git-dir")) {
  console.error("review-packet: not a git repository");
  process.exit(2);
}

const range = (() => {
  const r = opt("range");
  if (r) return r;
  const since = opt("since");
  if (since) {
    const from = sh(`git rev-list -1 --before="${since}" HEAD`);
    if (from) return `${from}..HEAD`;
  }
  for (const ref of ["origin/main", "origin/master", "main", "master"]) {
    const b = sh(`git merge-base ${ref} HEAD`);
    if (b && b !== sh("git rev-parse HEAD")) return `${b}..HEAD`;
  }
  return null;
})();

if (!range) {
  console.error("review-packet: could not infer a range — pass --range=<a>..<b> or --since=<date>");
  process.exit(2);
}

const commits = sh(`git log --format="%h|%an|%s" ${range}`).split("\n").filter(Boolean);
if (!commits.length) {
  console.error(`review-packet: no commits in ${range}`);
  process.exit(2);
}

const stat = sh(`git diff --stat ${range}`);
const added = sh(`git diff --name-only --diff-filter=A ${range}`).split("\n").filter(Boolean);
const modified = sh(`git diff --name-only --diff-filter=M ${range}`).split("\n").filter(Boolean);
const deleted = sh(`git diff --name-only --diff-filter=D ${range}`).split("\n").filter(Boolean);

const base = range.split("..")[0];
const baseDirs = new Set(
  sh(`git ls-tree -r --name-only ${base}`).split("\n").filter(Boolean).flatMap((p) => p.split("/").slice(0, -1)),
);
const novelDirs = [
  ...new Set(added.flatMap((f) => f.split("/").slice(0, -1)).filter((d) => !baseDirs.has(d))),
];

// Receipts already answer "does it pass", so the reviewer's time is not spent there.
const receiptDir = join(ROOT, "docs", "work", "receipts");
const receipts = existsSync(receiptDir)
  ? readdirSync(receiptDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const r = JSON.parse(readFileSync(join(receiptDir, f), "utf8"));
          const inRange = sh(`git merge-base --is-ancestor ${r.sha} HEAD && echo y`, "") === "y";
          return inRange ? { file: f, ...r } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  : [];

const out = (() => {
  const o = opt("out", join("docs", "work", "REVIEW_PACKET.md"));
  return isAbsolute(o) ? o : join(ROOT, o);
})();

const lines = [
  `# Review packet — \`${range}\``,
  "",
  `**Commits:** ${commits.length} · **Files:** ${added.length} new, ${modified.length} modified, ${deleted.length} deleted`,
  `**Generated:** by \`review-packet.mjs\` — regenerate rather than editing.`,
  "",
  "This is a bounded slice, not the repository. It is sized for one sitting; if it",
  "reads as too large to judge in that time, cut the range and generate two.",
  "",
  "## What has already been checked mechanically",
  "",
  receipts.length
    ? receipts
        .map((r) => {
          const failed = (r.results ?? []).filter((x) => x.exitCode !== 0);
          return `- \`${r.ticket}\` @ \`${String(r.sha).slice(0, 8)}\` — ${
            failed.length ? `**${failed.length} FAILING**: ${failed.map((f) => f.name).join(", ")}` : "all commands passed"
          }`;
        })
        .join("\n")
    : "_No verification receipts found. Typecheck/lint/test status is unverified — that is\n" +
      "a gap in the packet, not something for the reviewer to establish by hand._",
  "",
  "Please do not re-run the suite. If a receipt is missing or failing, that is a defect",
  "to report back, not work to absorb.",
  "",
  "## Where the pattern decisions are",
  "",
  added.length ? "New files — these carry the structural choices:" : "_No new files._",
  ...added.slice(0, 40).map((f) => `- \`${f}\``),
  added.length > 40 ? `- …and ${added.length - 40} more` : "",
  "",
  novelDirs.length
    ? `**Directory names with no precedent before this range:** ${novelDirs
        .map((d) => `\`${d}/\``)
        .join(", ")} — worth a look; this is where layout drift enters.`
    : "No new directory naming patterns.",
  "",
  "## Diffstat",
  "",
  "```",
  stat,
  "```",
  "",
  "## Commits",
  "",
  ...commits.map((c) => {
    const [h, a, s] = c.split("|");
    return `- \`${h}\` ${s} _(${a})_`;
  }),
  "",
  "## What this packet is asking for",
  "",
  "Not approval — a judgement on the things tooling cannot reach:",
  "",
  "1. **Does this fit the system?** Cross-cutting seams, transaction boundaries,",
  "   auth paths. A change can pass every test and still bypass an invariant that",
  "   the ticket never mentioned.",
  "2. **Is anything quietly missing?** Removed behaviour, dropped edge cases, error",
  "   paths that used to exist. A green suite is consistent with a smaller suite.",
  "3. **Would you maintain this?** Naming, structure, and whether a second engineer",
  "   could extend it without asking who wrote it.",
  "",
  "Concrete findings help most: `file:line` plus what you expected instead.",
  "",
  "## Reproduce locally",
  "",
  "```bash",
  `git log --oneline ${range}`,
  `git diff ${range}`,
  "```",
];

mkdirSync(dirname(out), { recursive: true });
// Keep the blank lines — they are markdown structure. Only collapse runs, which
// come from conditional sections rendering empty.
writeFileSync(out, lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n");

console.log(`review-packet: wrote ${out.replace(ROOT + "/", "")}`);
console.log(`  ${commits.length} commit(s), ${added.length + modified.length + deleted.length} file(s), ${receipts.length} receipt(s)`);
if (!receipts.length) console.log("  no receipts in range — the packet says so rather than implying it passed");
if (novelDirs.length) console.log(`  ${novelDirs.length} novel directory name(s) flagged`);
