# opencode-config-v2.jq — rewrite the v1-shaped entries install.sh writes into the OpenCode v2 config shape. Idempotent.
# VERIFIED against @opencode/schema 2.2.5 (config.d.ts, config/mcp.js, config/compaction.js):
#   v1 `mcp.<name> = { type, command, enabled }`          -> v2 `mcp.servers.<name> = { type, command, disabled? }`
#   v1 `permission.<action> = "allow" | { <glob>: effect }` -> v2 `permissions = [ { action, resource, effect } ]`
#   v1 action `bash` -> v2 `shell`; `task` -> `subagent`; `edit`, `read`, `external_directory`, `webfetch`, ... keep their names
#   (v2 binary asserts: edit, webfetch, external_directory, shell, read, question, execute — strings in the 2.2.5 bundle).
# `agents`, `plugins`, `commands`, `skills` are NOT written by install.sh: agents/plugins/commands/skills are discovered from the
# config directory, and a user's own entries in those keys are preserved untouched here.
# A v1-shaped `mcp.<name>` (has `.type`) written by install.sh WINS over an existing `mcp.servers.<name>` (path refresh).
# Optional: --argjson keep N  adds compaction.keep.tokens when absent.
def v2action: ({bash: "shell", task: "subagent"})[.] // .;
def fixmcp:
  if (.mcp | type) != "object" then .
  else
    .mcp as $m
    | ($m | to_entries | map(select(.key != "servers" and .key != "timeout" and (.value | type) == "object" and (.value | has("type")))) | from_entries) as $v1
    | ($v1 | map_values((if .enabled == false then . + {disabled: true} else . end) | del(.enabled))) as $conv
    | .mcp = (($m | with_entries(select(.key as $k | ($v1 | has($k)) | not))) + {servers: (($m.servers // {}) + $conv)})
  end;
def fixperm:
  if (.permission | type) != "object" then .
  else
    (.permission | to_entries | map(
        (.key | v2action) as $a
        | if (.value | type) == "string" then [{action: $a, resource: "*", effect: .value}]
          elif (.value | type) == "object" then (.value | to_entries | map({action: $a, resource: .key, effect: .value}))
          else [] end
      ) | add // []) as $rules
    | .permissions = (reduce $rules[] as $r ((.permissions // []); if any(.[]; . == $r) then . else . + [$r] end))
    | del(.permission)
  end;
def fixkeep:
  if ($keep | type) == "number" and (.compaction.keep.tokens == null) then .compaction.keep.tokens = $keep else . end;
fixmcp | fixperm | fixkeep
