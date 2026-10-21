chore(release): v3.14.2 — name a dropped provider stream in the TUI, the report and doctor

Second TUI capture (2026-10-21): with the v3.14.1 five-line handoff reply in
place, the reply still arrived four times — each cut at a different point,
and the longer blocks reworded between copies. Separate generations, not one
stream re-rendered: the provider dropped the stream mid-reply and opencode
retried, keeping every failed attempt's partial text in the message. Read
on screen as "the lead is looping". It is the model/provider, not the prompt.

- plugins/expert-hooks.ts: a completed assistant message carrying an error,
  or a finish that is neither stop nor tool-calls, prints a warning in the
  TUI naming the provider/model, the error and the output-token count, and
  says the partial text above is from the failed attempt. Telemetry rows now
  carry error_detail (first 200 chars of the provider's message).
- telemetry-report.mjs: new "Stream health per model" section — failed /
  messages, failure_rate, error names, finish=length count, and a verdict
  (>10% = UNRELIABLE, route sdlc-lead / reviewer roles elsewhere).
- doctor.sh: when run inside a project, reads that project's telemetry and
  warns on any model above 10% dropped streams.

What to do when it fires: put a steadier model on `roles.reviewer` /
`agents.sdlc-lead` in models.json (the lead is the one agent where a
dropped stream costs a human round-trip), or raise that provider's timeout
in opencode.json.
