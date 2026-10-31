// plugins/lib/tools/log-parser.ts — the body of tools/log-parser.ts, framework-neutral (WP-V1).
// NO opencode imports: tools/log-parser.ts (v1) re-wraps this with tool() + zod; the v2 shell registers it
// through ctx.tool.transform. Edit behaviour HERE.
import fs from "fs/promises"

const def = {
  description: "Parse and analyze logs with filtering, aggregation, and summary",

  async execute(args: any) {
    try {
      const content = await fs.readFile(args.filePath, "utf-8")
      const lines = content.split("\n")
      
      let filteredLines = lines.filter((line) => {
        if (!line.trim()) return false
        
        const logEntry = parseLogLine(line)
        
        if (args.filter.level !== "all" && logEntry.level) {
          if (logEntry.level.toLowerCase() !== args.filter.level) return false
        }
        
        if (args.filter.start && logEntry.timestamp) {
          if (new Date(logEntry.timestamp) < new Date(args.filter.start)) return false
        }
        
        if (args.filter.end && logEntry.timestamp) {
          if (new Date(logEntry.timestamp) > new Date(args.filter.end)) return false
        }
        
        if (args.filter.pattern && logEntry.message) {
          const regex = new RegExp(args.filter.pattern, "i")
          if (!regex.test(logEntry.message)) return false
        }
        
        return true
      })
      
      const summaryStats = args.summary ? generateSummary(filteredLines) : null
      
      const slicedLines = filteredLines.slice(0, args.limit)
      
      let result = ""
      
      if (summaryStats) {
        result += `=== LOG SUMMARY ===
Total lines: ${filteredLines.length}
Log levels:
  TRACE:  ${summaryStats.levels.trace || 0}
  DEBUG:  ${summaryStats.levels.debug || 0}
  INFO:   ${summaryStats.levels.info || 0}
  WARN:   ${summaryStats.levels.warn || 0}
  ERROR:  ${summaryStats.levels.error || 0}
  FATAL:  ${summaryStats.levels.fatal || 0}

Top error messages:
${summaryStats.topErrors.join("\n") || "None"}

Top sources:
${summaryStats.sources.map((s) => `  ${s.name}: ${s.count}`).join("\n") || "None"}

Top timestamps (by hour):
${summaryStats.hours.map((h) => `  ${h.hour}:00 - ${h.count} logs`).join("\n") || "None"}
====================

`
      }
      
      result += slicedLines.join("\n")
      
      if (filteredLines.length > args.limit) {
        result += `\n\n[... ${filteredLines.length - args.limit} more lines truncated ...]`
      }
      
      return result
    } catch (error) {
      return `ERROR: ${(error as Error).message}`
    }
  },
};interface LogEntry {
  timestamp?: string
  level?: string
  message?: string
  source?: string
  raw: string
}

interface LogSummary {
  levels: Record<string, number>
  topErrors: string[]
  sources: { name: string; count: number }[]
  hours: { hour: number; count: number }[]
}

function parseLogLine(line: string): LogEntry {
  const entry: LogEntry = { raw: line }
  
  const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]|^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/)
  if (timestampMatch) {
    entry.timestamp = timestampMatch[1]
  }
  
  const levelMatch = line.match(/\b(trace|debug|info|warn|warning|error|fatal|crit|critical)\b/i)
  if (levelMatch) {
    entry.level = levelMatch[1].toLowerCase()
    if (entry.level === "warning") entry.level = "warn"
    if (entry.level === "crit" || entry.level === "critical") entry.level = "fatal"
  }
  
  const sourceMatch = line.match(/\[(\w+)\]|\((\w+)\)|from (\w+)/i)
  if (sourceMatch) {
    entry.source = sourceMatch[1] || sourceMatch[2] || sourceMatch[3]
  }
  
  const message = line.replace(/\[[^\]]*\]/g, "").replace(/\([^)]*\)/g, "").trim()
  if (message) {
    entry.message = message
  }
  
  return entry
}

function generateSummary(lines: string[]): LogSummary {
  const stats: LogSummary = {
    levels: {},
    topErrors: [],
    sources: [],
    hours: [],
  }
  
  const levelCounts: Record<string, number> = {}
  const sourceCounts: Record<string, number> = {}
  const hourCounts: Record<number, number> = {}
  const errorMessages: string[] = []
  
  for (const line of lines) {
    const entry = parseLogLine(line)
    
    if (entry.level) {
      levelCounts[entry.level] = (levelCounts[entry.level] || 0) + 1
    }
    
    if (entry.source) {
      sourceCounts[entry.source] = (sourceCounts[entry.source] || 0) + 1
    }
    
    if (entry.timestamp) {
      try {
        const date = new Date(entry.timestamp)
        const hour = date.getHours()
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
      } catch (e) {
        // Invalid timestamp, skip
      }
    }
    
    if (entry.level === "error" || entry.level === "fatal") {
      errorMessages.push(entry.message || line)
    }
  }
  
  stats.levels = levelCounts
  
  const sortedErrors = errorMessages.sort((a, b) => errorCount(b) - errorCount(a))
  stats.topErrors = sortedErrors.slice(0, 5).map((e) => e.substring(0, 100) + (e.length > 100 ? "..." : ""))
  
  stats.sources = Object.entries(sourceCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
  
  stats.hours = Object.entries(hourCounts)
    .map(([hour, count]) => ({ hour: parseInt(hour, 10), count }))
    .sort((a, b) => b.count - a.count)
  
  return stats
}

function errorCount(line: string): number {
  const match = line.match(/(\d+)\s+(errors?|failures?)/i)
  return match ? parseInt(match[1], 10) : 0
}

export const name = "log-parser";
export const description: string = def.description;
export const inputSchema: Record<string, any> = {
  "type": "object",
  "properties": {
    "filePath": {
      "description": "Path to log file",
      "type": "string"
    },
    "filter": {
      "description": "Filter criteria",
      "default": {},
      "type": "object",
      "properties": {
        "level": {
          "description": "Log level to filter by",
          "default": "all",
          "type": "string",
          "enum": [
            "_trace",
            "debug",
            "info",
            "warn",
            "error",
            "fatal"
          ]
        },
        "start": {
          "description": "Start date/time ISO string",
          "default": "",
          "type": "string"
        },
        "end": {
          "description": "End date/time ISO string",
          "default": "",
          "type": "string"
        },
        "pattern": {
          "description": "Regex pattern to match in logs",
          "default": "",
          "type": "string"
        }
      }
    },
    "summary": {
      "description": "Include log summary/stats",
      "default": true,
      "type": "boolean"
    },
    "limit": {
      "description": "Max lines to return",
      "default": 100,
      "type": "number"
    }
  },
  "required": [
    "filePath"
  ]
};
export const execute: (args: any, ctx: any) => Promise<any> = def.execute;
export default { name, description, inputSchema, execute };
