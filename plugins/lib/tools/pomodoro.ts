// plugins/lib/tools/pomodoro.ts — the body of tools/pomodoro.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/pomodoro.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
import fs from "fs/promises";
import path from "path";

const def = {
  description: "Timer tool to prevent burnout using Pomodoro technique",

  async execute(args: any, context: any) {
    const state = await loadTimerState(context);

    if (args.action === "reset") {
      state.intervals = [];
      await saveTimerState(context, state);
      return "Pomodoro timer reset. All intervals cleared.";
    }

    if (args.action === "status") {
      const activeInterval = state.intervals.find((i) => !i.completed);

      if (!activeInterval) {
        return "No active Pomodoro interval. Start one with: action='start'";
      }

      const elapsed = Date.now() - activeInterval.startedAt;
      // Use stored durationMinutes, not args.duration, to correctly reflect the started interval
      const totalMs = activeInterval.durationMinutes * 60000;
      const remaining = Math.max(0, totalMs - elapsed);

      return `📊 Pomodoro Status
Active interval: ${activeInterval.name}
Started: ${new Date(activeInterval.startedAt).toLocaleTimeString()}
Progress: ${((elapsed / totalMs) * 100).toFixed(1)}%
Remaining: ${(remaining / 60000).toFixed(1)} minutes (≈${Math.ceil(remaining / 60000)}m ${Math.round((remaining % 60000) / 1000)}s)
`;
    }

    if (args.action === "stop") {
      const activeInterval = state.intervals.find((i) => !i.completed);

      if (!activeInterval) {
        return "No active Pomodoro interval to stop.";
      }

      activeInterval.completed = true;
      activeInterval.stoppedAt = Date.now();

      await saveTimerState(context, state);

      const durationMinutes =
        (activeInterval.stoppedAt - activeInterval.startedAt) / 60000;

      return `Pomodoro interval stopped early.
Type: ${activeInterval.name}
Duration: ${durationMinutes.toFixed(1)} minutes
Message: ${activeInterval.message || "(no message)"}`;
    }

    if (args.action === "break") {
      const breakDuration = args.intervalName === "long-break" ? 60 : 5;
      const breakType =
        args.intervalName === "long-break" ? "LONG BREAK 🌞" : "SHORT BREAK ☕";

      return `⏰ ${breakType}(${breakDuration} minutes)
${args.message || "Take a break, stretch, hydrate!"}`;
    }

    const intervalId = Date.now().toString();

    const interval: IntervalRecord = {
      id: intervalId,
      name: args.intervalName,
      durationMinutes: args.duration,
      message: args.message || getDefaultMessage(args.intervalName),
      startedAt: Date.now(),
      completed: false,
    };

    state.intervals.push(interval);

    await saveTimerState(context, state);

    const countdown = Math.ceil(args.duration * 60);

    return `⏰ Pomodoro started
Type: ${args.intervalName} (${args.duration} minutes)

${interval.message}

Countdown: ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}
Use action='status' to check progress
Use action='break' for a ${args.intervalName === "focus" ? "short break (5 min)" : "long break (60 min)"}`;
  },
};

interface IntervalRecord {
  id: string;
  name: string;
  durationMinutes: number;
  message: string;
  startedAt: number;
  completed: boolean;
  stoppedAt?: number;
}

interface TimerState {
  intervals: IntervalRecord[];
}

async function getTimerStateFilePath(projectRoot: string): Promise<string> {
  const timerDir = path.join(projectRoot, ".opencode-timers");
  await fs.mkdir(timerDir, { recursive: true });
  return path.join(timerDir, "state.json");
}

async function loadTimerState(context: {
  directory: string;
}): Promise<TimerState> {
  try {
    const stateFile = await getTimerStateFilePath(context.directory);
    const content = await fs.readFile(stateFile, "utf-8");
    if (!content.trim()) return { intervals: [] };
    return JSON.parse(content);
  } catch {
    return { intervals: [] };
  }
}

async function saveTimerState(
  context: { directory: string },
  state: TimerState,
): Promise<void> {
  try {
    const stateFile = await getTimerStateFilePath(context.directory);
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save timer state:", error);
  }
}

function getDefaultMessage(intervalName: string): string {
  switch (intervalName) {
    case "short-break":
      return "🎉 Short break! Take a drink of water, stretch your hands.";
    case "long-break":
      return "☀️ Long break! Step outside, get some sunlight, move your body.";
    case "focus":
    default:
      return "⏳ Focus time! Stay on task, eliminate distractions. You've got this!";
  }
}

export const name = "pomodoro";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "action": {
      "description": "Timer action to perform",
      "default": "start",
      "type": "string",
      "enum": [
        "start",
        "stop",
        "status",
        "break",
        "reset"
      ]
    },
    "duration": {
      "description": "Duration in minutes (default: 25 for Pomodoro)",
      "default": 25,
      "type": "number"
    },
    "intervalName": {
      "description": "Type of interval",
      "default": "focus",
      "type": "string",
      "enum": [
        "focus",
        "short-break",
        "long-break"
      ]
    },
    "message": {
      "description": "Custom notification message",
      "default": "",
      "type": "string"
    }
  }
};
export const execute: (args: any, ctx: any) => Promise<any> = def.execute;
export default { name, description, inputSchema, execute };
