<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# Orchestration Protocol

**Single entry point. Every request → pre-evaluation → optimal flow → dispatch → gates → verify.
No direct execution without planning.**

## Entry and intent

Load the applicable project instructions, the current task authorization and the installed package.
Natural-language requests and native commands use the same protocol. A bridge cannot claim
successful injection unless the runtime actually loaded the skill. A missing package produces the
gap statement and the single installation recommendation described in `SKILL.md`, and an honest
native/manual fallback only after explicit refusal.

Commands express intent, not permission:

| Intent | Purpose |
|---|---|
| `task "request"` | Universal entry — classify, plan, execute authorized work, verify, report |
| `task-plan "request"` | Read-only: show the optimal flow without executing. No builders, no installs, no provider writes |
| `task-status [id]` | Read existing task state: phase, agents, gates. Never resumes execution, never probes models by inference |
| `task-cancel [id]` | Stop only agents/processes owned by the task; preserve changes and resumable evidence. Cancellation is not cleanup authorization |
| `task-verify [id]` | Run the applicable authorized checks and report evidence. Cleanup is a separate authorized operation |
| `incident-start` | Alias for an `INCIDENT` task |
| `incident-evidence` | Alias for the `INCIDENT` evidence phase |
| `incident-fix` | Alias for the `INCIDENT` fix phase |
| `incident-verify` | Alias for `INCIDENT` verification |
| `incident-close` | Alias for `INCIDENT` close (persist runbook + regression refs, then cleanup) |

The orchestrator generates the `task_id` before dispatching anything, writes `task:{task_id}` and
`flow:{task_id}`, and returns the `task_id` in its response so status, cancellation and verification
can target it.

## Pre-Evaluation (MANDATORY for every request, auto, <30s)

No dispatch, edit or shell command may precede this object. Opening the run
(`llm-orchestrator run start --type <TASK_TYPE>`) follows it immediately.

**Inline shards.** A run whose shards must stay in the main thread because they hold live state
(a browser session, an interactive shell, a simulator) says so when it opens:
`run start --type <T> --shards <n> --inline "stateful:<what>"`. Independent reads around that state
are still dispatched — see "A shard ends where state ends" in [dispatch](policies/dispatch.md).

**Trivial tasks.** A one-line, obviously scoped change (a typo, a version bump) may skip the full
flow, but only by declaring it: `llm-orchestrator run start --trivial "<reason>"`. The
declaration and its reason are recorded; an undeclared skip is recorded as a skipped flow. A bug
fix that needs a regression test, or any change across two or more files, is **not** trivial — it
is a typed run. A trivial run that grows past that line gets one reminder to reopen it as a typed
run, and the audit counts it as `trivial_overreach`. A trivial run lasts one turn.

```json
{
  "raw_request": "user exact words",
  "task_type": "INCIDENT|FEATURE|BUG_FIX|REFACTOR|INVESTIGATION|DEPLOY|CONFIG|REVIEW|RESEARCH",
  "domain": "<project domain from the bindings section>|FRONTEND|BACKEND|DB|INFRA|UNKNOWN",
  "complexity": "SIMPLE|MODERATE|COMPLEX|CRITICAL",
  "urgency": "LOW|MEDIUM|HIGH|CRITICAL",
  "requires_evidence": true,
  "requires_code_change": true,
  "requires_deploy": false,
  "estimated_agents": 3,
  "required_mcps": ["mempalace", "sequentialthinking", "context7", "exa"],
  "required_skills": ["using-superpowers", "caveman", "search", "verification-before-completion"],
  "required_workflows": ["workflows/bug-fix.md"],
  "required_cli_tools": ["rtk"],
  "available_tools": [],
  "used_mcps": [],
  "permission_profile": "ORCHESTRATOR",
  "rtk_preflight": "command -v rtk && rtk --version",
  "fallback_plan": "sequential builders if the harness worktree manager is unavailable",
  "open_questions": [],
  "degraded": []
}
```

- `available_tools` is filled from live discovery (installed / loaded / callable / denied / unknown),
  never from memory or from a config file's existence.
- `used_mcps` is filled by each dispatched agent on return. Silent omission is a gate failure.
- `open_questions` accumulates every question that must go to the user — mandatory-tool gap, batched
  minor findings, destructive confirmation, genuine scope ambiguity. They are asked **once, together,
  through the harness's native question mechanism**; see [questions](policies/questions.md). An
  unanswered question resolves to `blocked_pending_user`, never to implied approval.
- `degraded` lists every mandatory item missing after an explicit user refusal. A non-empty
  `degraded` array must be echoed as a `degraded:` line in every plan, handoff and final report.

### Capability check (part of pre-evaluation)

- Which agent roles exist and are relevant?
- Which skills, workflows, MCPs and CLI tools does this task type require?
- Are the required MCPs actually loaded and callable?
- Any conflicts with existing worktrees or in-flight flows?
- Does every selected agent have its required permission profile (`RO`, `RW`, `ORCHESTRATOR`)?
- Does the RTK preflight pass in each delegated session?

### Flow construction

Build a TaskFlow object with phases, `plan_shards`, parallel groups, dependencies, gates, risks and
per-shard `max_iterations`. Do not dispatch until every shard has scope, owner, outputs, acceptance
checks, `restart_count: 0` and its own `routing` block. The PlanShard schema lives in
[dispatch](policies/dispatch.md).

**Model and thinking selection happens per shard, at dispatch time, against the live inventory — not
once per task.** Every PlanShard carries `routing` with `pair`, `tier`, `thinking_level`,
`model_requested`, `effort_requested`, `model_effective`, `effort_effective`, `review_floor`,
`independent_review`, `selection_reason`, `inventory_revision`, `price_source` and
`est_usd_per_task`. A shard without a filled `routing` block fails G0. When the inventory changes
mid-flow (model-not-found, rejected effort, quota change), selection is re-run for the **remaining**
shards only. See [dispatch](policies/dispatch.md) and [routing](policies/routing.md).

## Task classification and flows

| Type | Triggers | Flow | Core agent roles |
|---|---|---|---|
| **INCIDENT** | production error, 5xx, stuck state, webhook failure, alert | Evidence → Hypothesis → Fix → Verify → Close | production-telemetry-collector ×N + route-data-flow-tracer → adversarial-skeptic → builders → code-reviewer |
| **FEATURE** | "build", "add", "create", "implement" | Plan → TDD → Build → Test → Review → Verify | orchestrator → test-engineer → backend-fixer / frontend-fixer → code-reviewer |
| **BUG_FIX** | "fix", "repair", "broken" | Reproduce → Evidence → Hypothesis → Regression → Fix → Review | investigation → test-engineer → builders → code-reviewer |
| **REFACTOR** | "refactor", "clean up", "extract", "simplify" | Analyze → Coverage → Incremental → Review | code-simplifier → test-engineer → builders → code-reviewer |
| **INVESTIGATION** | "why", "analyze", "how does", "debug" | Evidence → Synthesis → Challenge → Report | evidence collectors ×N → synthesizer → adversarial-skeptic |
| **DEPLOY** | "deploy", "release", "ship" | Pre-checks → Deploy → Smoke → Soak | production-telemetry-collector → test-engineer |
| **CONFIG** | "configure", "migrate", "set up" | Plan → Change → Validate → Review | backend-fixer → db-migration-author → code-reviewer |
| **REVIEW** | "review", "audit", "check" | Analyze → Report | code-reviewer → adversarial-skeptic |
| **RESEARCH** | "research", "compare", "find out", time-sensitive facts | Source → Extract → Corroborate → Document | research collectors ×N → synthesizer → adversarial-skeptic |

Model and thinking assignments for every phase come from the flow matrix in
[routing](policies/routing.md). Agent role names above are the generic roster; the project's
bindings section maps them onto the roles that actually exist in the consuming project.

## Universal gates

G0 Plan Approved → G1 Evidence/Requirements Complete → G2 Hypothesis/Design Valid → G3 Test RED →
G4 Build GREEN → G5 Review PASS → G6 Verification Complete

| Gate | Criteria |
|---|---|
| **G0** Plan Approved | Flow built, agents available, resources allocated, ownership defined, every shard has scope/owner/outputs/acceptance and a filled `routing` block |
| **G1** Evidence / Requirements Complete | All required inputs gathered; evidence artifacts written and indexed by scope and revision |
| **G2** Hypothesis / Design Valid | A single falsifiable hypothesis (bugs, incidents) or an approved design (features, refactors) |
| **G3** Test RED | A failing test exists for the exact failure or requirement, and it has been observed failing |
| **G4** Build GREEN | All tests pass, lint clean, build succeeds — on fresh local evidence, not a builder's report |
| **G5** Review PASS | No ownership conflicts, hypothesis/requirements addressed, full suite GREEN, independent reviewer where a risk floor applies |
| **G6** Verification Complete | Domain smoke checks pass for the affected surfaces |

Each gate resolves to `passed`, `failed`, `unverified` or `not_applicable`, always with evidence or a
reason, recorded in `gate:{task_id}:{phase}`. **`not_applicable` requires a written reason** — it is
never a default and never a way to skip a gate that is merely inconvenient. Documentation and
research tasks do not fabricate a RED test; they mark G3 `not_applicable` with that reason. Missing
named tooling changes the bindings, not the truth of the acceptance criteria. Independent review
required by a risk floor is preserved even under quota pressure.

## Harness compatibility

The protocol is harness-neutral; only the mechanisms differ.

| Mechanism | Codex | Claude Code | OpenCode | Kilo |
|---|---|---|---|---|
| Command / prompt location | `~/.codex/prompts/*.md` (`$1 $2` positional or `$ARGUMENTS`) | `.claude/commands/*.md` (`$ARGUMENTS`) | `.opencode/command/*.md`, `.opencode/commands/*.md` | `.kilo/command/*.md`, `.kilo/commands/*.md` |
| Agent definition | `AGENTS.md` + spawned agent prompts | `.claude/agents/*.md` (frontmatter: `name`, `description`, `tools`, `model`) | `.opencode/agent/*.md` (frontmatter: `description`, `mode`, `permission`) | `.kilo/agent/*.md` |
| Dispatch primitive | `spawn_agent` (use `fork_turns="none"`) | Agent tool | `task` tool | `task` tool / `agent_manager` |
| Plan primitive | `update_plan` | plan mode / todo list | native plan/todo | native plan/todo |
| Worktree mechanism | git worktree (manual) | git worktree (manual) | git worktree (manual) | Agent Manager worktrees under `.kilo/worktrees/` |
| Skills root | `.agents/skills/*/SKILL.md` | `.claude/skills/*/SKILL.md`; `CLAUDE.md` imports with `@AGENTS.md` | `~/.config/opencode/skills` | `~/.kilo/skills` and `.kilo/skills` |
| Sequential Thinking permission key | MCP configured in `~/.codex/config.toml` | MCP server entry | `sequentialthinking_sequentialthinking` | `sequentialthinking_sequentialthinking` |

Resolve your harness here before dispatching. Do not import another harness's permission syntax,
agent roster or worktree layout, and never launch a second harness to obtain a capability.

## Workflow selection

After classification, load `workflows/<type>.md` for the selected lowercase type, and nothing else.
Read installed Superpowers workflows when applicable. Application commands are discovered from the
project's bindings section — they are never bundled in this package.

---

**Orchestrator = brain. Agents = hands. Every task gets the right hands, in the right order.**
