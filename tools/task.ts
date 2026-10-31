import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/task.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/task.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
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
  execute: (args, context) => impl.execute(args, context),
});
