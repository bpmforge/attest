// plugins/lib/post-edit.ts — post-edit checks (format → lint → type-check → secret-scan)
// and the shared after-tool handler (truncation + opt-in trace + post-edit checks).
// NO opencode imports: `$` is injected (v1: opencode's Bun shell; v2: plugins/lib/shell-shim.ts
// unless the v2 ctx offers its own). All checks are best-effort and never block the workflow.
import { appendFileSync } from "node:fs";
import { traceEvent } from "../../scripts/lib/trace-order.mjs";
import { SECRET_PATTERNS, SKIP_EXTENSIONS, extension } from "./guards.ts";
import { WRITE_TOOLS } from "./turn-cap.ts";
import { truncateToolOutput } from "./tool-output.ts";

export async function formatFile(filePath: string, ext: string, $: any) {
  try {
    if (
      [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".html"].includes(
        ext,
      )
    ) {
      await $`prettier --write ${filePath}`.quiet();
    } else if (ext === ".py") {
      await $`black ${filePath}`.quiet();
      await $`isort ${filePath}`.quiet();
    } else if (ext === ".go") {
      await $`gofmt -w ${filePath}`.quiet();
    } else if (ext === ".rs") {
      await $`rustfmt ${filePath}`.quiet();
    }
  } catch {
    // Formatter not installed or file unsupported — silent.
  }
}

export async function lintFile(filePath: string, ext: string, $: any) {
  try {
    if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
      const result = await $`eslint ${filePath} --max-warnings 0`
        .quiet()
        .nothrow();
      if (result.exitCode !== 0 && result.stdout?.length) {
        console.warn(
          `[lint] ${filePath}\n${result.stdout.toString().slice(0, 2000)}`,
        );
      }
    } else if (ext === ".py") {
      const result = await $`ruff check ${filePath}`.quiet().nothrow();
      if (result.exitCode !== 0 && result.stdout?.length) {
        console.warn(
          `[lint] ${filePath}\n${result.stdout.toString().slice(0, 2000)}`,
        );
      }
    }
  } catch {
    // Linter not installed — silent.
  }
}

export async function typeCheckFile(filePath: string, ext: string, $: any) {
  try {
    if ([".ts", ".tsx"].includes(ext)) {
      const result = await $`tsc --noEmit --pretty false ${filePath}`
        .quiet()
        .nothrow();
      if (result.exitCode !== 0 && result.stdout?.length) {
        const lines = result.stdout
          .toString()
          .split("\n")
          .slice(0, 30)
          .join("\n");
        console.warn(`[tsc] ${filePath}\n${lines}`);
      }
    }
  } catch {
    // tsc not installed — silent.
  }
}

export async function secretScan(filePath: string, _ext: string, $: any) {
  try {
    const content = (await $`cat ${filePath}`.quiet().text()) ?? "";
    const findings: string[] = [];
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(content)) findings.push(label);
    }
    if (findings.length) {
      console.warn(
        `[secret-scan] ${filePath} — possible secrets: ${findings.join(", ")}\nMove these to environment variables or a secrets manager.`,
      );
    }
  } catch {
    // File unreadable — silent.
  }
}


/**
 * After-tool handler shared by both shells. `input` = {tool, sessionID, args}; `output` is mutated
 * (output.output truncated, output.metadata annotated) exactly as the v1 hook always did.
 */
export function createAfterToolHandler(o: {
  $: any;
  toolOutputMax: number;
  env?: Record<string, string | undefined>;
  /** false = the shell already truncated (v2 truncates `result.content` itself); only trace + post-edit checks run. Default true. */
  truncate?: boolean;
}) {
  let traceSeq = 0;
  const env = o.env ?? process.env;
  return async function afterTool(input: any, output: any): Promise<void> {
    // Tool-result compression (TOKEN_OPTIMIZATION_PLAN D4 / backlog L14).
    const cut = o.truncate === false ? null : truncateToolOutput(input.tool, output?.output, o.toolOutputMax);
    if (cut) {
      output.output = cut.text;
      output.metadata = { ...(output.metadata ?? {}), truncatedBy: "expert-hooks", originalLength: cut.originalLength };
    }

    // K4: opt-in per-tool-call trace (EXPERTS_TRACE_LOG=<file>) for rule-compliance grading.
    const traceLog = env.EXPERTS_TRACE_LOG;
    if (traceLog) {
      try {
        appendFileSync(traceLog, JSON.stringify(traceEvent(++traceSeq, input, output)) + "\n");
      } catch {
        /* tracing must never break the tool call */
      }
    }
    if (!WRITE_TOOLS.has(input.tool)) return;

    const filePath: string = input.args?.filePath ?? input.args?.file_path ?? "";
    if (!filePath) return;

    const ext = extension(filePath);
    if (SKIP_EXTENSIONS.has(ext)) return;

    // Independent checks in parallel; a failure in one never affects the others.
    await Promise.allSettled([
      formatFile(filePath, ext, o.$),
      lintFile(filePath, ext, o.$),
      typeCheckFile(filePath, ext, o.$),
      secretScan(filePath, ext, o.$),
    ]);
  };
}
