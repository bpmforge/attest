#!/usr/bin/env node
// probe-prefix-cache.mjs — is the local model server reusing the prompt prefix?
//
// TOKEN_OPTIMIZATION_PLAN D3 / backlog L13. Telemetry shows cache_read = 0 on
// 2,700 local-model messages. Two readings are possible: KV/prefix reuse is
// off (every turn recomputes a ~40k-token prefix — the single most expensive
// thing in a local run), or the server reuses it but its OpenAI-compatible
// `usage` never reports `cached_tokens`, so the plugin cannot see it. This
// probe tells them apart without trusting the usage field:
//
//   1. send a long synthetic prefix (≈N tokens) + a short question — time it
//   2. send the SAME prefix + a different short question — time it
//   3. send a DIFFERENT prefix of the same length + short question — time it
//
// With prefix reuse on, (2) is dramatically faster than (1) and (3) (the
// prefill is skipped); with it off, all three take about the same. The verdict
// is printed with the ratio and whatever `usage.prompt_tokens_details` said.
//
// Usage:
//   node scripts/probe-prefix-cache.mjs [--base http://127.0.0.1:1234] [--model <id>] [--tokens 8000]
// Exit 0 reuse detected · 1 no reuse detected · 2 could not probe.

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const BASE = (opt('base', process.env.LMSTUDIO_URL || 'http://127.0.0.1:1234')).replace(/\/$/, '');
const TOKENS = Number(opt('tokens', 8000)) || 8000;
let MODEL = opt('model', null);

async function json(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text().catch(() => '')}`.slice(0, 300));
  return r.json();
}

// ~4 chars/token; vary the words so no two prefixes compress alike.
function prefix(seed) {
  const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'];
  let out = `Reference document ${seed}.\n`;
  let n = seed * 7919;
  while (out.length < TOKENS * 4) {
    n = (n * 1103515245 + 12345) % 2147483648;
    out += `${words[n % words.length]}-${(n >> 8) % 997} `;
    if (out.length % 90 < 12) out += '\n';
  }
  return out;
}

async function ask(sys, q) {
  const t0 = Date.now();
  const res = await json(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: q }],
      max_tokens: 8, temperature: 0, stream: false,
    }),
  });
  return { ms: Date.now() - t0, usage: res.usage || null };
}

async function main() {
  try {
    if (!MODEL) {
      const models = await json(`${BASE}/v1/models`);
      MODEL = models?.data?.[0]?.id;
      if (!MODEL) throw new Error('no model loaded (GET /v1/models returned none)');
    }
  } catch (e) {
    console.error(`probe-prefix-cache: cannot reach ${BASE}: ${e.message}`);
    return 2;
  }
  console.log(`probe-prefix-cache: ${BASE} model=${MODEL} prefix≈${TOKENS} tokens`);
  const A = prefix(1); const B = prefix(2);
  let cold, warm, other;
  try {
    cold = await ask(A, 'Reply with the single word: one.');
    warm = await ask(A, 'Reply with the single word: two.');
    other = await ask(B, 'Reply with the single word: three.');
  } catch (e) {
    console.error(`probe-prefix-cache: request failed: ${e.message}`);
    return 2;
  }
  const cached = (u) => u?.prompt_tokens_details?.cached_tokens ?? u?.cached_tokens ?? null;
  console.log(`  1. cold  (prefix A)        ${String(cold.ms).padStart(6)} ms   prompt_tokens=${cold.usage?.prompt_tokens ?? '?'} cached=${cached(cold.usage) ?? 'not reported'}`);
  console.log(`  2. warm  (prefix A again)  ${String(warm.ms).padStart(6)} ms   prompt_tokens=${warm.usage?.prompt_tokens ?? '?'} cached=${cached(warm.usage) ?? 'not reported'}`);
  console.log(`  3. other (prefix B)        ${String(other.ms).padStart(6)} ms   prompt_tokens=${other.usage?.prompt_tokens ?? '?'} cached=${cached(other.usage) ?? 'not reported'}`);
  const ratio = warm.ms / Math.max(1, Math.min(cold.ms, other.ms));
  const reportsCache = cached(warm.usage) !== null && cached(warm.usage) > 0;
  const reuse = ratio < 0.5 || reportsCache;
  console.log('');
  if (reuse) {
    console.log(`VERDICT: prefix reuse ON (warm/cold = ${ratio.toFixed(2)}${reportsCache ? `, server reports cached_tokens=${cached(warm.usage)}` : ', server does NOT report cached_tokens — telemetry cache_read=0 is under-reporting, not a miss'})`);
    return 0;
  }
  console.log(`VERDICT: prefix reuse OFF or ineffective (warm/cold = ${ratio.toFixed(2)}) — every turn re-prefills the whole prompt.`);
  console.log('  LM Studio: Developer tab -> server settings -> enable prompt/KV caching ("cache_prompt"); llama.cpp server: run with --cache-prompt (default on) and a single slot per session; Ollama: keep one model resident (OLLAMA_KEEP_ALIVE) and avoid num_ctx changes between calls.');
  return 1;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(2); });
