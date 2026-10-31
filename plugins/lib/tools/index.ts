// plugins/lib/tools/index.ts — registry of every framework-neutral tool (WP-V1).
// The v2 shell registers all of them via ctx.tool.transform; the v1 shells (tools/*.ts) import one each.
import append from "./append.ts";
import bash from "./bash.ts";
import deploy from "./deploy.ts";
import fileInfo from "./file-info.ts";
import logParser from "./log-parser.ts";
import loopDetector from "./loop-detector.ts";
import playwrightTest from "./playwright-test.ts";
import playwrightWeb from "./playwright-web.ts";
import pomodoro from "./pomodoro.ts";
import run from "./run.ts";
import semgrepRule from "./semgrep-rule.ts";
import semgrepScan from "./semgrep-scan.ts";
import simplifyFile from "./simplify-file.ts";
import task from "./task.ts";
import testRunner from "./test-runner.ts";
import update from "./update.ts";
import write from "./write.ts";

export interface NeutralTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  execute: (args: any, ctx: any) => Promise<any>;
}

export const allTools: NeutralTool[] = [
  append,
  bash,
  deploy,
  fileInfo,
  logParser,
  loopDetector,
  playwrightTest,
  playwrightWeb,
  pomodoro,
  run,
  semgrepRule,
  semgrepScan,
  simplifyFile,
  task,
  testRunner,
  update,
  write,
];
