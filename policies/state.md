<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# Task State and Memory (MEMPALACE — Mandatory)

MemPalace is a **mandatory** core tool, not a preference. Skipping it makes the work invalid: state
lives in drawers, contexts are disposable, and every clean-session dispatch depends on the drawer
references existing.

**AT SESSION START**: `mempalace_search("current project status")`,
`mempalace_search("user preferences")`, `mempalace_search(topic)`.

**DURING WORK**: `mempalace_add_drawer(title, content, room)` — save findings, decisions and results.
Save partial results when the context grows long, and after any non-obvious finding.

**AT SESSION END**: `mempalace_add_drawer("session summary", summary, "sessions")`,
`mempalace_add_drawer("task progress", remaining_todos, "tasks")`.

**CONTEXT MANAGEMENT**: long context → save to memory → continue shorter. Resume ("continue") → read
from memory. New topic → search memory first.

## Output drawers

| Drawer | Purpose |
|---|---|
| `task:{task_id}` | TaskFlow object, classification, status |
| `flow:{task_id}` | Phase definitions, agent assignments, gates, `plan_shards`, dispatch contract |
| `gate:{task_id}:{phase}` | Gate criteria, status, evidence, `not_applicable` reason |
| `evidence:{type}:{task_id}` | Agent findings, `file:line` refs, open questions, source revision |
| `hypothesis:{task_id}` | The single falsifiable hypothesis for bugs and incidents |
| `ownership:{task_id}` | File ownership for builders |
| `regression:{task_id}` | Regression test files, RED/GREEN evidence, run command |
| `review:{task_id}` | Code reviewer verdict |
| `runbook:{task_id}` | Complete timeline, decisions, gaps |
| `verification:{task_id}` | Verification results per stage |
| `cleanup:{task_id}` | `cleanup_state`, removed paths, branch, commit, sessions stopped, exit status |
| `permission_recovery:{task_id}:{phase}:{role}` | Blocked permission, source, profile, `restart_count`, next action |

Drawer names are literal and shared: the same strings appear in [dispatch](dispatch.md),
[cleanup](cleanup.md), [protocol.md](../protocol.md) and the generated command prompts. Never invent
a variant spelling.

## Flow flags (inside `flow:{task_id}`)

These are states, not drawers, and they carry these exact names:

| Flag | Set when | Cleared / terminal |
|---|---|---|
| `permission_recovery_pending` | A delegated session reported a required access denial | One recovery launch per `task_id + phase + role`; a second denial is terminal `permission_blocked` |
| `permission_blocked` | The second effective denial | Terminal — only a human can approve a non-restricted session |
| `subagent_stream_recovery_pending` | A child returned a runtime-declared resumable streaming failure | Cleared on a merged handoff; terminal `subagent_resume_unavailable` |
| `subagent_resume_unavailable` | The child id is not resumable and no phase contract exists to restart from | Terminal |
| `cleanup_state` | Every flow that created a branch or worktree | `complete`, `blocked_dirty`, `am_stale_ui` — see [cleanup](cleanup.md) |
| `restart_count` | Per phase/role, initialised to `0` before dispatch | Incremented by the orchestrator immediately before a recovery launch |
| `resume_count` | Per resumable child, initialised to `0` | At most three resume attempts |
| `open_questions` | A question must go to the user | Cleared when the batched native question is answered; unanswered items stay `blocked_pending_user` — see [questions](questions.md) |
| `inventory_revision` | Every shard routing decision | Bumped on a model-not-found, rejected effort or quota change; the remaining shards are re-routed |

## What a drawer holds

Scope, source revision, owners, phase and gate status, evidence paths, model/tool inventory
observations, refusal and degraded-mode decisions, requested and effective models, checks performed,
limitations and the next action.

**Never**: credentials, raw private logs, private reasoning transcripts, or full conversation
history. Keep handoffs ≤50 lines.

Checkpoint at meaningful boundaries, every 6–8 tool calls, before context pressure, or at ~70% of
the session budget. Do not make paid keep-alive calls to hold a session open.

On continue, read the existing state and the current diff, and resume from completed-chain evidence
rather than restarting planning. Invalidate only the facts whose scope actually changed. Status is
read-only. Cancellation records the stopped owned workers and preserves changes.

## Fallback when MemPalace is genuinely unavailable

MemPalace is mandatory, so an absence is handled by the portability rule in `SKILL.md`: state the gap
first, recommend installation once with the exact command, and only after an explicit user refusal
continue in **declared degraded mode** — every plan, handoff and final report carries a `degraded:
mempalace` line.

In that declared degraded mode, write the same drawers as files in an **authorized artifact store
outside the repository**, namespaced by project and task, with the same field contract and the same
prohibitions: no credentials, no raw private logs, no reasoning transcripts, no full conversation
history. Never write permanent memory into the repository merely because a workflow suggested it, and
never claim persistence succeeded when the adapter failed — report the gap and use the authorized
equivalent.
