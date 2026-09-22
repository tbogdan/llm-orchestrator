<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# Dispatch, Sessions and Evidence

## Clean Session Protocol

Long tasks use short, bounded sessions. Do not carry the full transcript into every phase.

- **One session owns one phase**: evidence, RED tests, one builder scope, review, or verification.
- Prompts pass **compact drawer references** (`task:{id}`, `flow:{id}`, `hypothesis:{id}`,
  `ownership:{id}`), owned files, acceptance criteria and exact commands. Do not paste full logs or
  prior transcripts.
- **Never dispatch broad prompts.** First create small `PlanShard` records, each with one objective,
  one role, one scope, one output drawer, dependencies, acceptance checks and `max_iterations` 8–15.
- Split complex tasks by provider, layer, flow or verification stage. **Minimum fan-out: 2 agents
  MODERATE, 3 COMPLEX, 4 CRITICAL** when independent work exists. Parallel groups: **2–6 agents**,
  **maximum 8 active shards** before synthesis. Split a shard at >1 hypothesis, >1 write owner, or
  >5 checks.
- Require **disjoint ownership** for parallel writers. Keep contract decisions, migrations,
  integration and synthesis sequential.
- Batch at most **6–8 tool calls**, then write a compact memory checkpoint: current phase, files,
  evidence, blockers, next command. Write the checkpoint before compaction, at the first
  context-pressure warning, or after roughly **70% of the session budget**.
- **Terminal conditions** for a session: `Maximum steps reached`, context compaction, or tool
  disable. Never resume an exhausted context; start a fresh session from the checkpoint. At 70% of
  shard budget, stop safely, persist the handoff and dispatch the remainder as a new shard — never
  wait for hard step exhaustion.
- If a managed session is busy without a diff or handoff after one bounded observation window,
  prompt once; if still idle, stop it, preserve its worktree state and start a fresh scoped session.
- **Never dispatch builders before G3 RED.** Never run overlapping writers on the same files. Verify
  worktree path, `git status` and `git diff --stat` before integration.
- Record `base_branch`, `source_branch`, `source_commit`, `worktree_path`, `worktree_owner` and
  `cleanup_state` in `flow:{task_id}` before dispatch. Only the orchestrator cleans managed
  worktrees; dirty, unmerged, external or unknown-provenance worktrees stay untouched and block
  close.
- **G4 requires fresh GREEN evidence. G5 requires read-only review after integration. G6 requires
  domain smoke checks. A builder report never substitutes for local diff/test evidence.**
- Keep handoffs compact (target ≤50 lines) with exact commands, exit status, changed files and known
  gaps. Handoff schema: `task_id`, `phase`, `status`, `owned_files`, `commands`, `evidence`,
  `blockers`, `next_action`.

Configured `steps:` values are agent iteration budgets. Per-turn and per-tool runtime limits are
external harness limits; project configuration cannot raise them.

## PlanShard schema (minimum)

```json
{
  "shard_id": "phase.concern",
  "phase": "EVIDENCE|RED|BUILD|REVIEW|VERIFY",
  "objective": "one measurable outcome",
  "agent": "role",
  "mode": "RO|RW",
  "scope": ["owned files or provider surface"],
  "outputs": ["drawer or commit artifact"],
  "depends_on": [],
  "acceptance": ["exact checks"],
  "max_iterations": 12,
  "restart_count": 0,
  "status": "pending",
  "routing": {
    "pair": "S T2",
    "tier": "S",
    "thinking_level": "T2",
    "model_requested": "claude-sonnet-5",
    "effort_requested": "medium",
    "model_effective": "claude-sonnet-5",
    "effort_effective": "medium",
    "review_floor": "S T3",
    "independent_review": false,
    "selection_reason": "FEATURE/implementation flow phase → S T2",
    "inventory_revision": 7,
    "price_source": "Artificial Analysis Intelligence Index v4.3.2 (2026-09-22) via models/model-thinking-data.json",
    "est_usd_per_task": 0.3
  }
}
```

## Per-shard cost-aware model selection (Mandatory)

**Model and thinking level are chosen for every shard, at dispatch time, against the live inventory —
never once per task.** A shard whose `routing` block is missing or partially filled is not
dispatchable and fails G0.

- The selection is the `classify()` → `rankModels()` pair from [routing](routing.md), run with that
  shard's role, phase, task type, area, risk, complexity, `context_tokens`, harness and the live
  inventory. `lib/dispatch-contract.mjs` implements it: `buildShardRouting(shard, options)` for one
  shard, `buildShardContracts(flow, { inventory, harness, includeCandidates })` for all of them.
- The thirteen `routing` fields are `pair`, `tier`, `thinking_level`, `model_requested`,
  `effort_requested`, `model_effective`, `effort_effective`, `review_floor`, `independent_review`,
  `selection_reason`, `inventory_revision`, `price_source`, `est_usd_per_task`. These names are
  canonical. They appear with exactly these names in
  [routing](routing.md) ("Dispatch metadata"), in [protocol.md](../protocol.md) and in
  `schemas/capability-contract.schema.json`. Never introduce a synonym.
- Two shards with different roles or phases resolve to **different** pairs. One pair for a whole flow
  is a routing failure, not a simplification.
- **The tier floor is never lowered to fit an inventory.** If nothing eligible for the resolved tier
  is exposed, take the next eligible exposed model *at that tier*; if there is none, set
  `blocked: "no eligible model"` and stop the shard. Never silently downgrade below the floor, and
  never fill a risk-floor review seat with a candidate model.
- `buildShardContracts` returns the **flow ledger**: the tier histogram against the target
  distribution, mean `$/task`, blocked shards and the warnings — reusing `estimateFlow` for the
  reference estimate. That ledger is what the cost discipline in [routing](routing.md) is measured
  against.

### Re-routing when the inventory changes mid-flow

A model-not-found error, a rejected effort value or a quota change invalidates the inventory, not the
flow. Refresh the inventory and **re-run selection for the remaining shards only**
(`rerouteRemaining(flow, inventory)`): shards already integrated, running or cancelled keep the
routing they were dispatched with — rewriting it would falsify the ledger. Record the new
`inventory_revision` and the re-routed shard ids in `flow:{task_id}`.

## Permission profiles

| Profile | Required access | Rules |
|---|---|---|
| `RO` | `read`, `bash`, `mcp`, `skill`; `edit: deny` | Evidence and review only. No provider writes, code edits or migration changes |
| `RW` | `*`, `bash`, `edit`, `mcp`, `skill`, `task: allow` | Full MCP/skill/task/bash access. Edits only files listed in `ownership:{task_id}` |
| `ORCHESTRATOR` | `read`, `bash`, `mcp`, `skill`, `task`; `edit: deny` | Coordinates and gates. Dispatches RW agents; never edits application code |

If a delegated RW session reports `bash deny *`, `edit deny` or MCP access denied, stop that
session's work, record `permission_recovery_pending` in `flow:{task_id}`, and run the session
recovery protocol before G3. **Never work around a denial by asking a builder to skip tests or to use
raw shell.**

MCP write calls remain subject to task ownership and phase gates even when the profile is `RW`.
Provider state changes require evidence, an idempotency plan and post-write verification.

## Permission preflight and session recovery

Every delegated phase must prove its required access before task-specific reads, edits, tests or
provider calls. Agents that require shell access run only this non-mutating preflight first:

```sh
command -v rtk && rtk --version
```

Required startup MCPs prove access through their non-mutating initialization calls: a memory
task/session lookup, one sequentialthinking thought, and a documentation library resolution when
docs apply. A required domain MCP must use its narrowest read-only status/list operation before any
provider write.

If any required tool is denied:

1. Do not retry the denied call, run cleanup commands, edit files or substitute a weaker
   verification path.
2. Write `permission_recovery:{task_id}:{phase}:{role}` while memory remains available. Include
   `blocked_permission`, `blocked_pattern`, `source`, `preflight_command`, `required_profile`,
   `restart_count` and `next_action`.
3. Return the same structured fields in the handoff when memory is unavailable.
4. Initialize `restart_count` to `0` in `flow:{task_id}` for every phase/role. The blocked agent
   echoes that value; the orchestrator increments it immediately before a recovery launch.
5. **The orchestrator, not the blocked agent**, stops the failed delegated session and starts one
   fresh session for the same role and phase with that role's declared profile. Prefer a managed
   worktree session where the harness provides one; otherwise use a fresh scoped task session.
6. Allow **one** recovery launch per `task_id + phase + role`. A second effective denial is terminal
   `permission_blocked`: record the exact denial and state that only a human can launch or approve a
   non-restricted session.

**Effective permission precedence**: permissions are evaluated after project, global and session
layers. A `source:session` deny wins over a project or global allow and cannot be repaired by
configuration — the only automatic recovery is one fresh delegated session. Never broaden static
permissions to hide that fact. Session-level bash denial is independent from the sequentialthinking
MCP permission.

## Subagent streaming recovery

When a child dispatch returns `Streaming response failed` and the runtime declares the session
resumable with a child ID, recover it before reporting any result:

1. Record `subagent_stream_recovery_pending` in `flow:{task_id}` with the failed child session ID,
   phase, role and `resume_count: 0`.
2. Call the dispatch tool again with that exact child ID, a compact continuation prompt and the
   original phase contract. The child keeps its context; do not create a parallel replacement while
   it is resumable.
3. Allow at most **three** resume attempts per child. Increment and persist `resume_count` before
   every call.
4. On success, merge its handoff into the original phase and continue normal gates without exposing
   the transient stream error to the user.
5. If the runtime reports `not a child of the current session`, **never retry that ID**. Start one
   fresh scoped child only when `flow:{task_id}` contains the original phase contract and ownership;
   otherwise record terminal `subagent_resume_unavailable` with the exact runtime error.
6. After the three-attempt budget, stop the child, write its last known phase state and evidence to
   memory, then start one fresh scoped child from that handoff. Do not reuse an exhausted context.

Never retry after a completed child handoff, and never duplicate a child that may still be running.
This applies only to runtime-declared resumable streaming failures — not cancellation, permission
denial or ordinary task errors.

## Sequentialthinking MCP call contract

`sequentialthinking` is an **MCP tool, not a skill**. Call it with the complete schema:

```json
{
  "thought": "...",
  "nextThoughtNeeded": false,
  "thoughtNumber": 1,
  "totalThoughts": 1,
  "isRevision": false,
  "revisesThought": 1,
  "branchFromThought": 1,
  "branchId": "",
  "needsMoreThoughts": false
}
```

Schema constraints: `revisesThought` and `branchFromThought` are integers **≥ 1** even when
revision/branch is false. Use `1` as the sentinel. Never send `0`, `null`, or omit them. On Kilo and
OpenCode the permission key is `sequentialthinking_sequentialthinking`; on other harnesses use the
runtime's discovered tool identifier and never hard-code one from another host.

## Dispatch contract

Before dispatching any agent, the orchestrator discovers loaded MCP servers, built-in tools, project
skills, workflows, CLI tools and agent permissions, then writes into `flow:{task_id}`:

`available_tools`, `required_mcps`, `required_skills`, `required_workflows`, `required_cli_tools`,
`permission_profile`, `rtk_preflight`, `fallback_plan`, `degraded`, `used_mcps` (filled on return),
`restart_count`, `max_iterations`, `inventory_revision` and the shard's `routing` block.

These fields are the concrete projection of one typed contract: each capability the child needs is
declared as **required** or **optional**, with its kind (MCP / skill / workflow / CLI / role), its
phase and its fallback. The agent must report each required MCP call — or its explicit
unavailable/error result — in `used_mcps`. **Silent omission is a gate failure.**

Each child brief carries: objective, phase, file ownership, acceptance checks, project invariants,
relevant evidence paths, capability bindings, requested model/effort and budget. The child reports
back loaded workflows and skills, actual tools used, effective model/effort, evidence, substitutions,
skipped optional items and missing capabilities. Children inherit recorded refusal decisions so none
of them repeats an installation recommendation the user already declined — but a declared degraded
mode is carried into the child brief, not hidden from it.

Child effective access may differ from the parent's. Verify the minimal read-only relevant access
before phase work, with no credential dump and no provider writes.

## Evidence reuse — no duplicate read-only passes

A read-only pass (deep dive, evidence collection, exploration) runs **once per chain**. Two RO passes
over the same scope with no write in between is a protocol violation — the second rediscovers what
the first already paid for.

- Every investigation/evidence phase writes its findings to an **evidence artifact** (findings,
  `file:line` refs, open questions). The artifact, not the agent's context, is the durable output.
- Planning consumes the artifact. The planner does **not** re-dispatch investigation "to be sure".
- Re-investigation is allowed only when (a) a **write landed** on files the evidence covers, or
  (b) the plan surfaces a **concrete, named gap**. Case (b) dispatches a *targeted delta-dive scoped
  to the gap only* — never a full re-sweep.
- Post-build verification and review read the diff and the artifact; they are not a re-investigation
  of the codebase.
- The orchestrator tracks per chain which scopes have evidence artifacts, at what revision. Before
  dispatching any RO agent, check that ledger and hand the artifact over instead.

## Clean-context dispatch — fresh subagent per task

Every new task, and every phase within a flow, launches a **fresh subagent with a minimal briefing**
— never an agent carrying the previous phase's (or previous task's) conversation history.

- Briefing = task statement + acceptance criteria + paths to evidence/plan artifacts + only the
  constraints that apply. Nothing else. State lives in artifacts; context is disposable.
- Small briefing → small context → the dispatch stays eligible for the **cheap tier** and stays under
  long-context pricing cliffs. An agent dragged through a long chain inflates every subsequent call's
  input cost and silently forces escalation the task never needed.
- The orchestrator is the only long-lived context. Workers are stateless between phases: the
  implementer does not inherit the planner's context, and the reviewer does not inherit the
  implementer's — the reviewer gets the diff plus artifacts. That is also what makes the review
  independent under the risk-floor rules.
- On Codex, this is the `fork_turns="none"` rule: bounded or no history forks, never full-history.
- Continuing an *existing* conversation with a subagent that already holds exactly the needed state
  is fine — the rule bans *inherited unrelated history*, not legitimate continuation.

## Harness dispatch primitives

| Harness | Dispatch | Plan | Worktrees |
|---|---|---|---|
| Codex | `spawn_agent` with `fork_turns="none"` | `update_plan` | git worktree (manual) |
| Claude Code | Agent tool | plan mode / todo list | git worktree (manual) |
| OpenCode | `task` tool | native plan/todo | git worktree (manual) |
| Kilo | `task` tool / `agent_manager` | native plan/todo | Agent Manager worktrees under `.kilo/worktrees/` |

Parallel work requires disjoint ownership and a real critical-path reduction; do not pad fan-out
beyond the minimums to satisfy an appearance of breadth, and do not fall below them when independent
scopes exist. A serial fallback is valid only where no required independence is lost — a reviewer's
independence is never negotiable.
