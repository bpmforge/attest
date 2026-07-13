#!/usr/bin/env node
/**
 * log-hop.mjs — CLI shim to record a model-decision hop to the escalation ledger.
 *
 * Used by detect-model-context.sh to emit a hop when model context is detected.
 * Fails gracefully (exits 0 even on DB errors) so model detection never breaks.
 *
 * Usage:
 *   node scripts/log-hop.mjs --task-fp <fp> --actual-model <model> --gate <gate> \
 *     [--lane <lane>] [--requested-model <model>] [--effort <effort>] \
 *     [--local-tokens <n>] [--frontier-tokens <n>] [--escalated]
 *
 * Example:
 *   node scripts/log-hop.mjs \
 *     --task-fp "session/detect-model-context-$(date +%s)" \
 *     --actual-model "qwen3.6-35b" \
 *     --gate "pass" \
 *     --lane "proc"
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { parseArgs } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the escalation-ledger package from the sibling amplifier repo
const ledgerPath = resolve(
  __dirname,
  '../../bpm-agent-amplifier/packages/escalation-ledger/dist/index.js'
);

let logHop;
try {
  // Dynamically import the ledger package
  const ledger = await import(`file://${ledgerPath}`);
  logHop = ledger.logHop;
  if (!logHop) {
    throw new Error('logHop not exported from escalation-ledger');
  }
} catch (err) {
  // Fail gracefully: if the ledger package isn't available, log a warning but exit 0
  console.warn(`[log-hop] Warning: Could not load escalation-ledger: ${err.message}`);
  console.warn('[log-hop] Skipping hop emission. Run "npm run build" in bpm-agent-amplifier to fix.');
  process.exit(0);
}

const options = {
  'task-fp': { type: 'string', required: true },
  'actual-model': { type: 'string', required: true },
  'gate': { type: 'string', required: true },
  'lane': { type: 'string' },
  'requested-model': { type: 'string' },
  'effort': { type: 'string' },
  'local-tokens': { type: 'string', default: '0' },
  'frontier-tokens': { type: 'string', default: '0' },
  'escalated': { type: 'boolean', default: false },
  'help': { type: 'boolean', short: 'h' },
};

const { values } = parseArgs({ options, allowPositionals: false });

if (values.help) {
  console.log(`
log-hop.mjs — Record a model-decision event to the escalation ledger

Usage:
  node scripts/log-hop.mjs --task-fp <fp> --actual-model <model> --gate <gate> [options]

Required:
  --task-fp <fp>           Task fingerprint (e.g., "session/detect-model-context-1234")
  --actual-model <model>   The model that was used (e.g., "qwen3.6-35b")
  --gate <result>          Gate result: pass | fail | borderline

Optional:
  --lane <lane>            Lane/task-type for grouping (e.g., "proc")
  --requested-model <model> Model originally requested (if different from actual)
  --effort <effort>        Effort level (e.g., "local-low", "sonnet")
  --local-tokens <n>       Tokens used locally (default: 0)
  --frontier-tokens <n>    Tokens used on frontier (default: 0)
  --escalated              Flag: did this escalate to frontier?
  --help, -h               Show this help

Example:
  node scripts/log-hop.mjs \\
    --task-fp "session/detect-model-context-\$(date +%s)" \\
    --actual-model "qwen3.6-35b" \\
    --gate "pass" \\
    --lane "proc"
`);
  process.exit(0);
}

try {
  // Validate required fields
  if (!values['task-fp']) {
    console.error('[log-hop] Error: --task-fp is required');
    process.exit(1);
  }
  if (!values['actual-model']) {
    console.error('[log-hop] Error: --actual-model is required');
    process.exit(1);
  }
  if (!values.gate || !['pass', 'fail', 'borderline'].includes(values.gate)) {
    console.error('[log-hop] Error: --gate must be one of: pass, fail, borderline');
    process.exit(1);
  }

  const hop = {
    taskFp: values['task-fp'],
    actualModel: values['actual-model'],
    requestedModel: values['requested-model'] || values['actual-model'],
    gate: values.gate,
    effort: values.effort || undefined,
    lane: values.lane || undefined,
    escalated: values.escalated || false,
    frontierVerdict: undefined, // Not set during detection
    tokens: {
      local: parseInt(values['local-tokens'], 10) || 0,
      frontier: parseInt(values['frontier-tokens'], 10) || 0,
    },
    ts: new Date().toISOString(),
  };

  // Call logHop to write to the ledger
  logHop(hop);
  console.log(`[log-hop] Recorded hop for ${hop.actualModel} (${hop.gate})`);
  process.exit(0);
} catch (err) {
  // Fail gracefully: always exit 0 so we don't break model detection
  console.warn(`[log-hop] Error recording hop: ${err.message}`);
  process.exit(0);
}
