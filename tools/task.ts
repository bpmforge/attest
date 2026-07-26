import { tool } from "@opencode-ai/plugin";
import { spawn } from "child_process";

/**
 * task.ts — Spawn a sub-agent via `opencode run --agent <type>`
 *
 * Agent name → opencode agent file mapping:
 *   test-engineer       ~/.config/opencode/agents/test-engineer.md
 *   code-reviewer       ~/.config/opencode/agents/code-reviewer.md
 *   security-auditor    ~/.config/opencode/agents/security-auditor.md
 *   db-architect        ~/.config/opencode/agents/db-architect.md
 *   sre-engineer        ~/.config/opencode/agents/sre-engineer.md
 *   ux-engineer         ~/.config/opencode/agents/ux-engineer.md
 *   api-designer        ~/.config/opencode/agents/api-designer.md
 *   researcher          ~/.config/opencode/agents/researcher.md
 *   performance-engineer ~/.config/opencode/agents/performance-engineer.md
 *   container-ops       ~/.config/opencode/agents/container-ops.md
 */
export default tool({
  description:
    "Delegate a task to a specialist sub-agent. The agent runs opencode in a subprocess " +
    "and returns a plain-text summary of findings. Use this when the sdlc-lead needs to " +
    "hand off work to a specialist (test-engineer, code-reviewer, security-auditor, etc.).",
  args: {
    agent: tool.schema
      .enum([
        "api-designer",
        "code-reviewer",
        "container-ops",
        "db-architect",
        "performance-engineer",
        "researcher",
        "security-auditor",
        "sre-engineer",
        "test-engineer",
        "ux-engineer",
      ])
      .describe(
        "Agent to delegate to. Maps directly to the agent file name in ~/.config/opencode/agents/. " +
          "skill→agent: /test-expert→test-engineer, /review-code→code-reviewer, " +
          "/security→security-auditor, /dba→db-architect, /devops→sre-engineer, " +
          "/ux→ux-engineer, /api-design→api-designer, /research→researcher, " +
          "/perf→performance-engineer, /containers→container-ops",
      ),
    prompt: tool.schema
      .string()
      .describe(
        "Full instructions for the agent. Include: what to analyze, which files/paths, " +
          "what output format you expect, and success criteria.",
      ),
    timeout: tool.schema
      .number()
      .max(900)
      .default(180)
      .describe(
        "Timeout in seconds (default 180, max 900). Multi-phase agents need 600-900s.",
      ),
  },
  async execute(args, context) {
    const { agent, prompt, timeout } = args;
    const timeoutMs = Math.min(timeout * 1000, 900_000);
    const startMs = Date.now();

    // Show immediately so the user knows the task has started
    context.metadata({ title: `task: ${agent} — starting...` });

    return new Promise<string>((resolve) => {
      const proc = spawn(
        "opencode",
        ["run", "--agent", agent, "--format", "json", prompt],
        {
          cwd: context.directory,
          shell: false,
          env: { ...process.env },
        },
      );

      const chunks: string[] = [];
      const errChunks: string[] = [];
      // Partial line buffer for real-time JSON parsing
      let lineBuffer = "";
      // Last short snippet from the agent's output (for progress title)
      let lastSnippet = "working...";

      // Heartbeat: update title every 5s so user can see it's alive
      const heartbeat = setInterval(() => {
        const elapsed = Math.round((Date.now() - startMs) / 1000);
        const snippet = lastSnippet.slice(0, 60).replace(/\n/g, " ");
        context.metadata({
          title: `task: ${agent} — ${elapsed}s — ${snippet}`,
        });
      }, 5_000);

      // Parse a single JSON line from the event stream and extract text.
      // Also fires context.metadata immediately on every new assistant message
      // so the user sees real-time progress rather than waiting for the heartbeat.
      function processLine(line: string) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) return;
        try {
          const ev = JSON.parse(trimmed) as Record<string, unknown>;
          if (ev.type === "message") {
            const msg = ev.message as Record<string, unknown> | undefined;
            if (msg?.role === "assistant") {
              const content = msg.content;
              if (typeof content === "string" && content.trim()) {
                lastSnippet = content.trim();
                const elapsed = Math.round((Date.now() - startMs) / 1000);
                context.metadata({
                  title: `task: ${agent} — ${elapsed}s — ${lastSnippet.slice(0, 60).replace(/\n/g, " ")}`,
                });
              } else if (Array.isArray(content)) {
                for (const block of content) {
                  const b = block as Record<string, unknown>;
                  if (
                    b.type === "text" &&
                    typeof b.text === "string" &&
                    (b.text as string).trim()
                  ) {
                    lastSnippet = (b.text as string).trim();
                    const elapsed = Math.round((Date.now() - startMs) / 1000);
                    context.metadata({
                      title: `task: ${agent} — ${elapsed}s — ${lastSnippet.slice(0, 60).replace(/\n/g, " ")}`,
                    });
                  }
                }
              }
            }
          }
        } catch {
          // skip malformed JSON
        }
      }

      proc.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        chunks.push(chunk);

        // Process complete lines in real time for progress updates
        lineBuffer += chunk;
        const lines = lineBuffer.split("\n");
        // Keep the last partial line in the buffer
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          processLine(line);
        }
      });

      proc.stderr.on("data", (data: Buffer) => errChunks.push(data.toString()));

      const timer = setTimeout(() => {
        clearInterval(heartbeat);
        proc.kill("SIGTERM");
        const elapsed = Math.round((Date.now() - startMs) / 1000);
        context.metadata({
          title: `task: ${agent} — TIMED OUT after ${elapsed}s`,
        });
        resolve(
          `[task: TIMEOUT] Agent '${agent}' timed out after ${timeout}s. ` +
            `Partial output:\n${extractText(chunks.join(""))}`,
        );
      }, timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timer);
        clearInterval(heartbeat);
        const elapsed = Math.round((Date.now() - startMs) / 1000);
        const raw = chunks.join("");
        const errRaw = errChunks.join("").trim();

        // `opencode run --agent <x>` where x is mode:subagent does NOT fail — it
        // prints a notice and silently falls back to the DEFAULT agent, then exits
        // 0. The caller gets generic-agent output and believes a specialist ran.
        // Caught in the field 2026-07-25 driving a local model through the pipeline:
        // requirements "completed" having been produced by no specialist at all.
        // Exit 0 is not evidence the right agent ran — check.
        if (/is a subagent, not a primary agent/.test(`${errRaw}\n${raw}`)) {
          context.metadata({
            title: `task: ${agent} — WRONG AGENT (subagent fallback)`,
          });
          resolve(
            `[task: AGENT FALLBACK] '${agent}' is a subagent, so opencode ran the DEFAULT agent instead. ` +
              `Its output is NOT this specialist's work and must not be treated as such. ` +
              `Dispatch a mode:primary agent, or run this specialist via a HANDOFF (path C).`,
          );
          return;
        }

        if (code === 0) {
          const text = extractText(raw);

          // PROOF OF EXECUTION (the general rule; the subagent check above is one
          // symptom of it). BOUNDED_TASK_CONTRACT Rule 3 requires every specialist
          // to print `✓ <agent> done — [...]` as its last act. Without that phrase
          // we cannot distinguish "ran and found nothing" from "never ran" — and
          // those are the SAME observable today: exit 0 plus plausible prose.
          //
          // That ambiguity is why every failure in the 2026-07-25 local-model
          // evaluation read as a model deficiency: broken plumbing fails closed,
          // and failing closed is indistinguishable from "the model didn't do it".
          // An empty result is a claim, and a claim needs evidence.
          const phrase = new RegExp(`✓\\s*${agent}\\s+done`, "i");
          if (!phrase.test(text) && !phrase.test(raw)) {
            context.metadata({
              title: `task: ${agent} — NO COMPLETION PHRASE (treat as NOT RUN)`,
            });
            resolve(
              `[task: NOT RUN] '${agent}' exited 0 but never printed its completion phrase ` +
                `("✓ ${agent} done — ..."), so there is no evidence the specialist actually ran to completion. ` +
                `Do NOT treat the text below as this specialist's result — an absent finding here means ` +
                `UNKNOWN, not "nothing found". Re-dispatch, or run it as a HANDOFF (path C) and check the ` +
                `Completion Manifest with scripts/validators/validate-completion-manifest.sh.\n\n` +
                `--- unverified output follows ---\n${text.slice(0, 2000)}`,
            );
            return;
          }

          context.metadata({ title: `task: ${agent} — done in ${elapsed}s` });
          resolve(text || "Agent completed (no text output captured).");
        } else {
          const text = extractText(raw);
          const hint = errRaw ? `\nstderr: ${errRaw.slice(0, 400)}` : "";
          context.metadata({
            title: `task: ${agent} — exit ${code} after ${elapsed}s`,
          });
          resolve(
            `[task: exit ${code}] Agent '${agent}' exited with error.` +
              (text ? `\nPartial output:\n${text}` : "") +
              hint,
          );
        }
      });

      proc.on("error", (err: Error) => {
        clearTimeout(timer);
        clearInterval(heartbeat);
        context.metadata({ title: `task: ${agent} — spawn error` });
        resolve(
          `[task: spawn error] Could not start opencode: ${err.message}\n` +
            `Make sure 'opencode' is in your PATH. Fallback: ask the user to run ` +
            `'opencode run --agent ${agent} "..."' manually.`,
        );
      });
    });
  },
});

/**
 * Extract readable assistant text from opencode's JSON event stream.
 * opencode --format json emits one JSON object per line.
 * We pick out "assistant" message content blocks.
 */
function extractText(raw: string): string {
  const lines = raw.split("\n").filter((l) => l.trim().startsWith("{"));
  const parts: string[] = [];

  for (const line of lines) {
    try {
      const ev = JSON.parse(line) as Record<string, unknown>;
      // opencode JSON format: { type: "message", message: { role, content: [...] } }
      if (ev.type === "message") {
        const msg = ev.message as Record<string, unknown> | undefined;
        if (msg?.role === "assistant") {
          const content = msg.content;
          if (typeof content === "string") {
            parts.push(content);
          } else if (Array.isArray(content)) {
            for (const block of content) {
              const b = block as Record<string, unknown>;
              if (b.type === "text" && typeof b.text === "string") {
                parts.push(b.text);
              }
            }
          }
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  return parts.join("\n").trim();
}
