/**
 * test-check-tools.ts -- chapter module for scripts/test.ts.
 *
 * Guards scripts/check-tools.sh against the bare-Linux failure reported
 * 2026-07 (Ubuntu 24.04 noble, non-root, node from a root-owned global prefix).
 * Every auto-install printed a bare "FAILED <tool>" with no reason, and the
 * install hints were macOS-only, so the real causes had to be reverse-engineered
 * by hand:
 *   - npm i -g -> EACCES on a root-owned prefix
 *   - pipx absent, and PEP 668 blocks `pip install --user pipx`
 *   - mmdc pulls puppeteer -> needs unzip + Chromium libs, and a half-finished
 *     download poisons every retry
 *
 * These are static invariants so they run on any platform. The behavioural proof
 * is scripts/test-check-tools-container.sh, which needs podman/docker and a bare
 * ubuntu:24.04 image — GitHub's ubuntu-latest has a writable npm prefix and
 * unzip installed, so CI cannot reproduce the bug and a green CI run proves
 * nothing here.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export async function testCheckTools(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const scriptPath = path.join(root, "scripts/check-tools.sh");
  const text = fs.readFileSync(scriptPath, "utf8");
  const lines = text.split("\n");

  // The script legitimately *mentions* sudo/apt/`npm config set prefix` inside
  // comments and inside the hint strings it prints. Only executable code counts,
  // so strip comment lines and the contents of quoted strings before asserting.
  // (Both of these tripped this test's own first draft.)
  const codeOnly = (s: string) =>
    s
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .map(
        (l) =>
          l
            .replace(/(^|[^\\])#(?![{(]).*$/, "$1") // trailing comment
            .replace(/"(?:[^"\\]|\\.)*"/g, '""') // double-quoted contents
            .replace(/'(?:[^'])*'/g, "''"), // single-quoted contents
      )
      .join("\n");
  const code = codeOnly(text);

  // -- 1/6. Never-sudo contract: no line EXECUTES sudo or a package manager. --
  // Match COMMAND POSITION only — the first word of a command. `have apt-get`
  // passes apt-get as an argument to a lookup helper, which is fine.
  const PRIV = /^(sudo|apt-get|apt|dnf|pacman|zypper|apk|brew)$/;
  const execSudo = code.split("\n").filter((l) => {
    const segments = l.split(/(?:&&|\|\||[;|(])/); // command boundaries
    return segments.some((seg) => {
      // Skip shell keywords that precede the real command.
      const words = seg
        .trim()
        .split(/\s+/)
        .filter(
          (w) => w && !/^(if|elif|then|else|do|while|until|!|\{|\})$/.test(w),
        );
      return words.length > 0 && PRIV.test(words[0]);
    });
  });
  if (execSudo.length === 0) {
    ok(
      "check-tools.sh -- never-sudo contract: no sudo/apt/dnf/pacman invoked in command position (hints are printed, not run)",
    );
  } else {
    fail(
      "check-tools.sh -- never-sudo contract",
      `these lines appear to execute a privileged command: ${execSudo
        .slice(0, 3)
        .map((l) => l.trim())
        .join(" ⏎ ")}`,
    );
  }

  // -- 2/6. Install failures must print the REAL reason, not just "FAILED". ---
  // The old script ran `eval "$cmd" >/dev/null 2>&1`, which is exactly why the
  // field report had to be debugged by hand.
  const swallows = /eval\s+"\$cmd"\s*>\/dev\/null\s*2>&1/.test(text);
  const capturesStderr = /out=\$\(eval\s+"\$cmd"\s+2>&1\)/.test(text);
  const printsReason = /printf[^\n]*\$out[^\n]*\n?[\s\S]{0,120}?tail -3/.test(
    text,
  );
  if (!swallows && capturesStderr && printsReason) {
    ok(
      "check-tools.sh -- install failures capture stderr and print the reason (no >/dev/null 2>&1 swallow)",
    );
  } else {
    fail(
      "check-tools.sh -- failure diagnostics",
      `swallowsStderr=${swallows} capturesStderr=${capturesStderr} printsReason=${printsReason}`,
    );
  }

  // -- 3/6. npm EACCES fallback is scoped, not a global npmrc rewrite. -------
  const hasEaccesBranch = /EACCES\|permission denied\|EPERM/.test(text);
  const usesScopedPrefix = /npm i -g --prefix/.test(text);
  // Check `code`, not `text`: the script's comments explain why it deliberately
  // avoids `npm config set prefix`, and matching that prose is a false positive.
  const rewritesNpmrc = /npm\s+config\s+set\s+prefix/.test(code);
  if (hasEaccesBranch && usesScopedPrefix && !rewritesNpmrc) {
    ok(
      "check-tools.sh -- npm EACCES retries into a user prefix via --prefix, without rewriting the user's npmrc",
    );
  } else {
    fail(
      "check-tools.sh -- npm EACCES fallback",
      `eaccesBranch=${hasEaccesBranch} scopedPrefix=${usesScopedPrefix} rewritesNpmrc=${rewritesNpmrc} (npm config set prefix mutates ~/.npmrc as a side effect — use --prefix)`,
    );
  }

  // -- 4/6. mmdc must NOT be auto-installed. --------------------------------
  // PUPPETEER_SKIP_DOWNLOAD yields a *broken* renderer, which is worse than
  // absent: validate-mermaid.sh cleanly skips a missing mmdc but a broken one
  // fails at runtime.
  const mmdcRow = lines.find((l) => l.startsWith("mmdc|"));
  const mmdcAutoField = mmdcRow ? mmdcRow.split("|")[3] : undefined;
  if (mmdcRow && mmdcAutoField === "") {
    ok(
      "check-tools.sh -- mmdc is report-only (empty auto-install field): a Chromium download does not belong in a never-sudo helper",
    );
  } else {
    fail(
      "check-tools.sh -- mmdc auto-install",
      `expected an empty auto-install field for mmdc, got ${JSON.stringify(mmdcAutoField)}`,
    );
  }

  // -- 5/6. Install hints are OS-correct (the brew-on-Linux bug). ------------
  const osAwareTrufflehog =
    /trufflehog_hint\(\)/.test(text) &&
    /\$OS"?\s*==\s*"macos"/.test(text) &&
    /brew install trufflehog/.test(text);
  // No unconditional brew hint left in the tool table itself.
  const brewInTable = /^\w[^|]*\|[^|]*\|brew install/m.test(text);
  if (osAwareTrufflehog && !brewInTable) {
    ok(
      "check-tools.sh -- install hints resolve per-OS (no unconditional `brew install` shown to Linux users)",
    );
  } else {
    fail(
      "check-tools.sh -- OS-correct hints",
      `osAwareTrufflehog=${osAwareTrufflehog} unconditionalBrewInTable=${brewInTable}`,
    );
  }

  // -- 6/6. Report mode still runs clean and exits 0 on this platform. -------
  try {
    const out = execFileSync("/bin/bash", [scriptPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, EXPERTS_TELEMETRY: "0" },
      timeout: 120_000,
    });
    if (/Code-analysis tools/.test(out)) {
      ok(
        "check-tools.sh -- report mode exits 0 and prints the tool table on this platform",
      );
    } else {
      fail(
        "check-tools.sh -- report mode",
        `unexpected output: ${out.slice(0, 300)}`,
      );
    }
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    fail(
      "check-tools.sh -- report mode",
      `exit=${e.status} stderr=${(e.stderr ?? "").slice(0, 300)}`,
    );
  }
}
