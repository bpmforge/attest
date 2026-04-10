import { tool } from "@opencode-ai/plugin"
import { spawn } from "child_process"

export default tool({
  description: "Run tests with better error handling and summary",
  args: {
    testFile: tool.schema.string().default("").describe("Specific test file to run (empty = all)"),
    pattern: tool.schema.string().default("").describe("Test name pattern to filter"),
    coverage: tool.schema.boolean().default(false).describe("Run with coverage report"),
    watch: tool.schema.boolean().default(false).describe("Watch mode"),
  },
  async execute(args, context) {
    try {
      const { cmd, argsArray } = getTestCommand(args, context.directory)
      
      return new Promise<string>((resolve) => {
        let output = ""
        let errorOutput = ""
        let exitCode = 0
          let passed = 0
          let failed = 0
          let skipped = 0
        
        const proc = spawn(cmd, argsArray, { cwd: context.directory })
        
        proc.stdout.on("data", (data) => {
          const chunk = data.toString()
          output += chunk
          parseTestResult(chunk, { setPassed: (n) => passed = n, setFailed: (n) => failed = n, setSkipped: (n) => skipped = n })
        })
        
        proc.stderr.on("data", (data) => {
          errorOutput += data.toString()
        })
        
        proc.on("close", (code) => {
          exitCode = code || 0
          
          const summary = `\n\n=== TEST SUMMARY ===
Total: ${passed + failed + skipped}
Passed: ${passed}
Failed: ${failed}
Skipped: ${skipped}
Exit Code: ${exitCode}
====================`
          
          if (errorOutput) {
            resolve(output + summary + `\n\nSTDERR:\n${errorOutput}`)
          } else {
            resolve(output + summary)
          }
        })
        
        proc.on("error", (err) => {
          resolve(`Failed to start test runner: ${err.message}\n\nOutput so far:\n${output}`)
        })
      })
    } catch (error) {
      return `ERROR: ${(error as Error).message}`
    }
  },
})

function getTestCommand(args: { testFile: string; pattern: string; coverage: boolean; watch: boolean }, cwd: string): { cmd: string; argsArray: string[] } {
  const packageJsonPath = require("path").resolve(cwd, "package.json")
  
  try {
    const packageJson = require(packageJsonPath)
    
    if (packageJson.scripts?.test) {
      let cmd = "npm"
      const argsArray = ["run", "test"]
      
      if (args.testFile) {
        argsArray.push("--", args.testFile)
      }
      
      if (args.pattern) {
        argsArray.push("--", "-t", args.pattern)
      }
      
      if (args.coverage) {
        argsArray.push("--", "--coverage")
      }
      
      if (args.watch) {
        argsArray.push("--", "--watch")
      }
      
      return { cmd, argsArray }
    }
    
    if (packageJson.devDependencies?.jest || packageJson.dependencies?.jest) {
      let cmd = "npx"
      const argsArray = ["jest"]
      
      if (args.testFile) {
        argsArray.push(args.testFile)
      } else {
        argsArray.push("--findRelatedTests")
      }
      
      if (args.pattern) {
        argsArray.push("-t", args.pattern)
      }
      
      if (args.coverage) {
        argsArray.push("--coverage")
      }
      
      if (args.watch) {
        argsArray.push("--watch")
      }
      
      return { cmd, argsArray }
    }
    
    if (packageJson.devDependencies?.vitest || packageJson.dependencies?.vitest) {
      let cmd = "npx"
      const argsArray = ["vitest"]
      
      if (args.testFile) {
        argsArray.push(args.testFile)
      }
      
      if (args.pattern) {
        argsArray.push("-t", args.pattern)
      }
      
      if (args.coverage) {
        argsArray.push("--coverage")
      }
      
      if (args.watch) {
        argsArray.push("--watch")
      } else {
        argsArray.push("--run")
      }
      
      return { cmd, argsArray }
    }
    
    if (packageJson.devDependencies?.mocha || packageJson.dependencies?.mocha) {
      let cmd = "npx"
      const argsArray = ["mocha"]
      
      if (args.testFile) {
        argsArray.push(args.testFile)
      } else {
        argsArray.push("test/**/*.test.js")
      }
      
      return { cmd, argsArray }
    }
    
    throw new Error("No test framework detected. Add jest, vitest, mocha, or a 'test' script to package.json")
  } catch (err) {
    throw new Error(`Failed to detect test framework: ${(err as Error).message}`)
  }
}

interface TestCounters {
  setPassed: (n: number) => void
  setFailed: (n: number) => void
  setSkipped: (n: number) => void
}

function parseTestResult(chunk: string, counters: TestCounters): void {
  const passedMatch = chunk.match(/(\d+)\s+(passing|passed)/i)
  if (passedMatch) {
    counters.setPassed(parseInt(passedMatch[1], 10))
  }
  
  const failedMatch = chunk.match(/(\d+)\s+(failing|failed)/i)
  if (failedMatch) {
    counters.setFailed(parseInt(failedMatch[1], 10))
  }
  
  const skippedMatch = chunk.match(/(\d+)\s+(pending|skipped)/i)
  if (skippedMatch) {
    counters.setSkipped(parseInt(skippedMatch[1], 10))
  }
}
