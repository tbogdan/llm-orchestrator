---
description: "Handle a task through the portable orchestration entrypoint"
---
<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->

Load and follow the `orchestrate-core` skill (or, in a project install, the bridge `.agents/skills/orchestrate/SKILL.md`) before handling this request.
Mode: execute
Arguments: $ARGUMENTS

Execute the requested task within the project contract.

Mandatory — before any planning or execution step, declare the status of each
core tool in this order (present / gap declared / explicit user refusal):

1. `using-superpowers` (orchestration.bootstrap — invoke first, always)
2. `mempalace` recall (memory.recall)
3. `mempalace` checkpoint (memory.checkpoint)
4. `sequentialthinking` MCP (reasoning.checkpoints)
5. `caveman` (communication.concise)
6. `rtk` preflight `command -v rtk && rtk --version` (shell.rtk)
7. `context7` before code/fix/update/review checks (docs.current)
8. `exa` for any external or current fact (research.retrieve)
9. `verification-before-completion` (verification.checks)

Questions: native, batched, once — every question to the user (mandatory-tool gap, batched
"skip or fix?" minor findings, destructive confirmation, surviving scope ambiguity) goes through the
harness's native question mechanism (user.native_question), batched into ONE question at the decision
point. Never free text at the end of a message; no answer means `blocked_pending_user`, never
implied approval. Subagents never ask the user: they return `question_for_user` in the handoff.

A mandatory gap is declared first and a one-time install is recommended before
continuing. Only after an explicit user refusal may work continue, and only in
declared degraded mode (`degraded:` line in every plan, handoff and report) — never silently.

Orchestrator: discover tools/permissions (installed / loaded / callable / denied); read the
project's `## Orchestration bindings (project)` section; allocate task_id; record task/flow
drawers; emit the pre-evaluation JSON; split the plan into small PlanShards before dispatch
(one concern, one role, one R/W boundary, one measurable output); dispatch independent shards
in parallel (2+ agents for MODERATE, 3+ COMPLEX, 4+ CRITICAL when independent work exists;
parallel groups 2–6, max 8 active shards before synthesis); keep each shard at 8–15 iterations
and requeue the unfinished remainder at 70%; pass compact drawer refs, scope, owner,
dependencies, acceptance checks and output drawer — never transcripts; require the
non-mutating RTK access preflight before each shard; route EVERY shard separately at dispatch
time against the live inventory, filling its `routing` block (`pair`, `tier`,
`thinking_level`, `model_requested`, `effort_requested`, `model_effective`,
`effort_effective`, `review_floor`, `independent_review`, `selection_reason`,
`inventory_revision`, `price_source`, `est_usd_per_task`) from the W/S/X/F tier and T0–T5
thinking level in the routing policy, with risk floors and an independent reviewer seat that is
never cut — never one pair for the whole task, never a silent downgrade below a tier floor
(`blocked: no eligible model` instead), and on an inventory change re-route the remaining shards
only; enforce G0–G6; checkpoint to memory every 6–8 tool calls or before
compaction. If a child returns `Streaming response failed` with a resumable id, record
`subagent_stream_recovery_pending`, resume that exact child with its original phase contract
(max three attempts), else one fresh child only from a complete handoff, else
`subagent_resume_unavailable`. On a required access deny, record
`permission_recovery:{task_id}:{phase}:{role}`, stop the blocked session and launch one fresh
session with the matching declared profile (RO/RW); a repeated deny is terminal
`permission_blocked` — only a human can approve a non-restricted session. Never bypass a
deny, weaken access grants or skip verification. Integrate only after diff/test evidence; record
`used_mcps` and verification; run the post-integration cleanup gate before claiming done.
Sequentialthinking schema: `revisesThought` and `branchFromThought` are integers >= 1
(use 1 as sentinel when false), never 0/null/omitted.
