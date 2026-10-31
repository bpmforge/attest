import { tool } from "@opencode-ai/plugin";
import impl from "../plugins/lib/tools/deploy.ts";

// v1 shell (WP-V1): the implementation lives in plugins/lib/tools/deploy.ts and is shared with the v2 plugin.
export default tool({
  description: impl.description,
  args: {
    command: tool.schema
      .enum(["build", "push", "deploy", "rebuild", "status"])
      .default("deploy")
      .describe("Deployment command to run"),
    image: tool.schema.string().describe("Container image name"),
    tag: tool.schema.string().default("latest").describe("Image tag"),
    path: tool.schema.string().default(".").describe("Path to Dockerfile"),
    registry: tool.schema.string().default("").describe("Registry to push to (empty = local)"),
    detach: tool.schema.boolean().default(true).describe("Run in background"),
    env: tool.schema
      .array(tool.schema.string())
      .default([])
      .describe("Environment variables as KEY=VALUE pairs"),
  },
  execute: (args, context) => impl.execute(args, context),
});
