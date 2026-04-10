import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Timer tool to prevent burnout using Pomodoro technique",
  args: {
    action: tool.schema
      .enum(["start", "stop", "status", "break", "reset"])
      .default("start")
      .describe("Timer action to perform"),
    duration: tool.schema.number().default(25).describe("Duration in minutes (default: 25 for Pomodoro)"),
    intervalName: tool.schema
      .enum(["focus", "short-break", "long-break"])
      .default("focus")
      .describe("Type of interval"),
    message: tool.schema.string().default("").describe("Custom notification message"),
  },
  async execute(args, context) {
    const state = await loadTimerState(context)
    
    if (args.action === "reset") {
      state.intervals = []
      await saveTimerState(context, state)
      
      return "Pomodoro timer reset. All intervals cleared."
    }
    
    if (args.action === "status") {
      const activeInterval = state.intervals.find((i) => !i.completed)
      
      if (!activeInterval) {
        return "No active Pomodoro interval. Start one with: action='start'"
      }
      
      const elapsed = Date.now() - activeInterval.startedAt
      const remaining = Math.max(0, args.duration * 60000 - elapsed)
      
      return `📊 Pomodoro Status
Active interval: ${activeInterval.name}
Started: ${new Date(activeInterval.startedAt).toLocaleTimeString()}
Progress: ${(elapsed / (args.duration * 60000) * 100).toFixed(1)}%
Remaining: ${(remaining / 60000).toFixed(1)} minutes (≈${Math.ceil(remaining / 60000)}m ${Math.round((remaining % 60000) / 1000)}s)
`

    }
    
    if (args.action === "stop") {
      const activeInterval = state.intervals.find((i) => !i.completed)
      
      if (!activeInterval) {
        return "No active Pomodoro interval to stop."
      }
      
      activeInterval.completed = true
      activeInterval.stoppedAt = Date.now()
      
      await saveTimerState(context, state)
      
      const durationMinutes = (activeInterval.stoppedAt - activeInterval.startedAt) / 60000
      
      return `Pomodoro interval stopped early.
Type: ${activeInterval.name}
Duration: ${durationMinutes.toFixed(1)} minutes
Message: ${activeInterval.message || "(no message)"}`
    }
    
    if (args.action === "break") {
      const breakDuration = args.intervalName === "long-break" ? 60 : 5
      const breakType = args.intervalName === "long-break" ? "LONG BREAK 🌞" : "SHORT BREAK ☕"
      
      return `⏰ ${breakType}(${breakDuration} minutes)
${args.message || "Take a break, stretch, hydrate!"}`
    }
    
    const intervalId = Date.now().toString()
    
    const interval: IntervalRecord = {
      id: intervalId,
      name: args.intervalName,
      durationMinutes: args.duration,
      message: args.message || getDefaultMessage(args.intervalName),
      startedAt: Date.now(),
      completed: false,
    }
    
    state.intervals.push(interval)
    
    await saveTimerState(context, state)
    
    const countdown = Math.ceil(args.duration * 60)
    
    return `⏰ Pomodoro started
Type: ${args.intervalName} (${args.duration} minutes)

${interval.message}

Countdown: ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}
Use action='status' to check progress
Use action='break' for a ${args.intervalName === "focus" ? "short break (5 min)" : "long break (60 min)"}`
  },
})

interface IntervalRecord {
  id: string
  name: string
  durationMinutes: number
  message: string
  startedAt: number
  completed: boolean
  stoppedAt?: number
}

interface TimerState {
  intervals: IntervalRecord[]
}

async function loadTimerState(context: { directory: string }): Promise<TimerState> {
  const stateFile = getTimerStateFilePath(context.directory)
  
  try {
    const content = await Deno.readTextFile(stateFile)
    
    if (!content.trim()) {
      return { intervals: [] }
    }
    
    return JSON.parse(content)
  } catch (error) {
    return { intervals: [] }
  }
}

async function saveTimerState(context: { directory: string }, state: TimerState): Promise<void> {
  const stateFile = getTimerStateFilePath(context.directory)
  
  try {
    await Deno.writeTextFile(stateFile, JSON.stringify(state, null, 2))
  } catch (error) {
    console.error("Failed to save timer state:", error)
  }
}

function getTimerStateFilePath(projectRoot: string): string {
  const timerDir = projectRoot + "/.opencode-timers"
  
  try {
    Deno.statSync(timerDir)
  } catch (error) {
    try {
      Deno.mkdirSync(timerDir)
    } catch (mkdirError) {
      console.error("Failed to create timer directory:", mkdirError)
    }
  }
  
  return timerDir + "/state.json"
}

function getDefaultMessage(intervalName: string): string {
  switch (intervalName) {
    case "short-break":
      return "🎉 Short break! Take a drink of water, stretch your hands."
    case "long-break":
      return "☀️ Long break! Step outside, get some sunlight, move your body."
    case "focus":
    default:
      return "⏳ Focus time! Stay on task, eliminate distractions. You've got this!"
  }
}
