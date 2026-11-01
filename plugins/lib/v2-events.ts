// plugins/lib/v2-events.ts — OpenCode v2 event payloads -> the v1-shaped assistant `info` the shared handlers consume.
// NO opencode imports (structural types only), so scripts/test-plugins-v2-types.ts can unit-test it without a v2 host.
//
// VERIFIED against @opencode/schema + @opencode/client 2.2.5 (generated/types.d.ts):
//   - every event is `{ id, created, type, data }`; the payload is under `.data` (NOT `.properties`).
//   - `session.step.started`  data: { sessionID, assistantMessageID, agent, model:{id,providerID,variant?}, started }
//   - `session.step.ended`    data: { sessionID, assistantMessageID, finish, cost, tokens:{input,output,reasoning,cache:{read,write}} }
//   - `session.step.failed`   data: { sessionID, assistantMessageID, error:{type,message}, cost?, tokens? }
//   - `session.text.ended`    data: { sessionID, assistantMessageID, ordinal, text }
//   - `session.usage.updated` data: { sessionID, cost, tokens } — EPHEMERAL, no messageID and no step boundary, so it cannot
//     drive per-message telemetry / turn counting / the stall guard (nothing to dedupe on). The durable step.ended carries
//     the same TokenUsage plus the message id, agent (via step.started) and finish, so it is the "assistant message completed"
//     record. usage.updated is not used for decisions.
//   - `session.message.content.updated` is REPLAY-ONLY ("older releases allowed replacing completed assistant content") and is
//     not in the subscribable event list, so assistant text for the stall guard comes from `session.text.ended`.

export interface V2TokenUsage { input: number; output: number; reasoning: number; cache: { read: number; write: number } }

export interface V2StepStarted { sessionID: string; assistantMessageID: string; agent: string; model: { id: string; providerID: string; variant?: string }; started: number }
export interface V2StepEnded { sessionID: string; assistantMessageID: string; finish: string; cost: number; tokens: V2TokenUsage }
export interface V2StepFailed { sessionID: string; assistantMessageID: string; error: { type: string; message: string }; cost?: number; tokens?: V2TokenUsage; finish?: string }

/** The subset of the v1 `message.updated` info that plugins/lib/{telemetry,stall-guard,compaction-trigger}.ts read. */
export interface AssistantInfo {
  role: "assistant";
  id: string;
  sessionID: string;
  mode: string | null;
  providerID: string;
  modelID: string;
  time: { created: number; completed: number };
  tokens: V2TokenUsage;
  cost: number;
  finish: string | null;
  error?: { name: string; message: string };
  path: { root: string };
}

const ZERO: V2TokenUsage = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };

/** Remembers step.started (agent/model/start time) per assistant message so step.ended/failed can build a full row. */
export function createStepAdapter(root: () => string) {
  const started = new Map<string, V2StepStarted>();
  const build = (d: V2StepEnded | V2StepFailed, created: number, finish: string | null, error?: { name: string; message: string }, consume = true): AssistantInfo => {
    const st = started.get(d.assistantMessageID);
    if (consume) started.delete(d.assistantMessageID);
    return {
      role: "assistant",
      id: d.assistantMessageID,
      sessionID: d.sessionID,
      mode: st?.agent ?? null,
      providerID: st?.model.providerID ?? "unknown",
      modelID: st?.model.id ?? "unknown",
      time: { created: st?.started ?? created, completed: created },
      tokens: d.tokens ?? ZERO,
      cost: d.cost ?? 0,
      finish,
      ...(error ? { error } : {}),
      path: { root: root() },
    };
  };
  return {
    stepStarted(d: V2StepStarted): AssistantInfo {
      if (started.size > 2000) started.clear();
      started.set(d.assistantMessageID, d);
      // An in-flight (not completed) message: lets the once-per-session model receipt fire at the earliest observable point.
      return { ...build({ sessionID: d.sessionID, assistantMessageID: d.assistantMessageID, finish: "", cost: 0, tokens: ZERO }, d.started, null, undefined, false), time: { created: d.started, completed: 0 } };
    },
    stepEnded(d: V2StepEnded, created: number): AssistantInfo {
      return build(d, created, d.finish);
    },
    stepFailed(d: V2StepFailed, created: number): AssistantInfo {
      return build(d, created, d.finish ?? "error", { name: d.error.type, message: d.error.message });
    },
  };
}
