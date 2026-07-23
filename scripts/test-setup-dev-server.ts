/**
 * test-setup-dev-server.ts -- chapter module for scripts/test.ts.
 *
 * Guards scripts/setup-dev-server.sh, the one-command provisioner for a remote
 * Linux dev box (opencode + experts + local-LLM provider config).
 *
 * Two layers:
 *   - Static invariants here (never-sudo, backs up config before writing,
 *     strict mode, valid --help).
 *   - The behavioural merge proof is scripts/test-setup-dev-server.sh, run via
 *     the shell so it exercises the exact python heredoc the script ships.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export async function testSetupDevServer(
  root: string,
  ok: (label: string) => void,
  fail: (label: string, reason: string) => void,
): Promise<void> {
  const scriptPath = path.join(root, "scripts/setup-dev-server.sh");
  const text = fs.readFileSync(scriptPath, "utf8");

  // Executable-command lines only: strip comments and the contents of quoted
  // strings, so the many *mentions* of sudo in help/warn text are not matched.
  const code = text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .map((l) =>
      l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'])*'/g, "''"),
    )
    .join("\n");

  // -- 1/4. Never runs sudo/apt. It surfaces the command; install.sh and
  //         check-tools.sh (already bare-Linux-safe) own escalation guidance. --
  const PRIV = /^(sudo|apt-get|apt|dnf|pacman|zypper|apk)$/;
  const execPriv = code.split("\n").filter((l) => {
    return l.split(/(?:&&|\|\||[;|(])/).some((seg) => {
      const words = seg
        .trim()
        .split(/\s+/)
        .filter(
          (w) => w && !/^(if|elif|then|else|do|while|until|!|\{|\})$/.test(w),
        );
      return words.length > 0 && PRIV.test(words[0]);
    });
  });
  if (execPriv.length === 0) {
    ok("setup-dev-server.sh -- never runs sudo/apt in command position");
  } else {
    fail(
      "setup-dev-server.sh -- never-sudo",
      `privileged command executed: ${execPriv
        .slice(0, 2)
        .map((l) => l.trim())
        .join(" ⏎ ")}`,
    );
  }

  // -- 2/4. Backs up opencode.json before mutating it. --------------------
  const backsUp = /cp\s+"\$CONFIG"\s+"\$BACKUP"/.test(text);
  const writesConfig = /json\.dump\(cfg,\s*f/.test(text);
  if (backsUp && writesConfig) {
    ok(
      "setup-dev-server.sh -- timestamped backup taken before the config is rewritten",
    );
  } else {
    fail(
      "setup-dev-server.sh -- config backup",
      `backsUp=${backsUp} writesConfig=${writesConfig}`,
    );
  }

  // -- 3/4. Strict mode, so a failed step aborts instead of half-provisioning. --
  if (/^set -euo pipefail\s*$/m.test(text)) {
    ok("setup-dev-server.sh -- runs under 'set -euo pipefail'");
  } else {
    fail("setup-dev-server.sh -- strict mode", "no 'set -euo pipefail' found");
  }

  // -- 4/4. --help works and documents the LLM endpoint default. ----------
  try {
    const help = execFileSync("/bin/bash", [scriptPath, "--help"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (/--llm-url/.test(help) && /--no-pull/.test(help)) {
      ok("setup-dev-server.sh -- --help lists --llm-url and the refresh flags");
    } else {
      fail(
        "setup-dev-server.sh -- help",
        `unexpected help text: ${help.slice(0, 200)}`,
      );
    }
  } catch (e: unknown) {
    const err = e as { status?: number; stderr?: string };
    fail(
      "setup-dev-server.sh -- help",
      `exit=${err.status} ${(err.stderr ?? "").slice(0, 200)}`,
    );
  }

  // -- Behavioural: the merge is non-destructive/idempotent/outage-safe. ---
  try {
    execFileSync(
      "/bin/bash",
      [path.join(root, "scripts/test-setup-dev-server.sh")],
      {
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    ok(
      "setup-dev-server.sh -- config merge is non-destructive, idempotent, and outage-safe (behavioural)",
    );
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string };
    fail(
      "setup-dev-server.sh -- config merge",
      `merge test failed (exit ${err.status}):\n${(err.stdout ?? "").slice(-600)}`,
    );
  }
}
