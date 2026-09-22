<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# Coherence — one name, one source of truth

This package is a skill, not a library of essays: a rule stated in one file and contradicted (or
merely renamed) in another is a defect, because the model that reads it cannot tell which spelling is
real. Every vocabulary below has exactly **one** source of truth; every other file restates it in the
same words.

`tests/coherence.test.mjs` checks classes 1–7, 9 and 10 mechanically, so drift fails CI instead of
being found by a reader. Class 8 is checked in `tests/adapters.test.mjs`.

| # | Cross-reference class | Source of truth | Restated in |
|---|---|---|---|
| 1 | Dispatch-contract field names (`required_mcps`, `required_skills`, `required_workflows`, `required_cli_tools`, `available_tools`, `used_mcps`, `permission_profile`, `rtk_preflight`, `fallback_plan`, `degraded`, `restart_count`, `max_iterations`, `inventory_revision`, `routing`) | `lib/dispatch-contract.mjs` | `protocol.md` (pre-evaluation JSON), `policies/dispatch.md` (Dispatch contract), `schemas/capability-contract.schema.json` |
| 1b | PlanShard `routing` block — the thirteen names in `SHARD_ROUTING_FIELDS` | `lib/dispatch-contract.mjs` → `SHARD_ROUTING_FIELDS` | `policies/dispatch.md` (PlanShard schema), `policies/routing.md` (Dispatch metadata), `protocol.md` (Flow construction), `schemas/capability-contract.schema.json` → `$defs.shardRouting`, `adapters/commands.mjs` (task checklist) |
| 2 | Drawer and flow-flag names (`task:`, `flow:`, `gate:`, `evidence:`, `hypothesis:`, `ownership:`, `regression:`, `review:`, `runbook:`, `verification:`, `cleanup:`, `permission_recovery:`; flags `permission_recovery_pending`, `permission_blocked`, `subagent_stream_recovery_pending`, `subagent_resume_unavailable`, `cleanup_state`, `open_questions`) | `policies/state.md` | `policies/dispatch.md`, `policies/cleanup.md`, `protocol.md`, `adapters/commands.mjs`, `workflows/*.md` |
| 3 | The 8 mandatory core tools, in order | `registries/core-profile.json` (orders 1–8) | `SKILL.md`, `policies/capabilities.md`, `lib/first-run.mjs` (`checkMandatoryTools`), `adapters/commands.mjs` (checklist items 1–8), `README.md` |
| 4 | Task types (UPPER form ↔ lowercase id ↔ workflow file) | `registries/task-mappings.json` → `task_types` | `protocol.md` (classification table), `registries/routing-matrix.json` → `task_flows`, `workflows/<file>.md`, `bin/route.mjs --list`, `lib/router.mjs` → `TASK_TYPES` |
| 5 | Agent role ids | `registries/agent-roles.json` → `roles[].id` | `registries/routing-matrix.json` → `agent_defaults` and `task_flows[].phases[].roles`, `policies/routing.md` (Agent defaults), `workflows/*.md` role tables, `adapters/agents.mjs` |
| 6 | Risk-floor areas | `registries/routing-matrix.json` → `risk_floors` | `policies/routing.md` (Risk floors table, one row per key, key in backticks) |
| 7 | Gate labels G0–G6 | `protocol.md` (Universal gates table) | `policies/verification.md` (G3–G6), `workflows/*.md` (all seven) |
| 8 | Installed bridge text | `lib/adapter-renderer.mjs` → `bridgeContent`, `AGENTS_SENTENCE` | must promise what `SKILL.md` promises: mandatory gate, gap declared first, single install recommendation, explicit refusal, and the `degraded: <item>` line wording |
| 9 | CLI flags | the `--help` / usage strings in `bin/cli-options.mjs` and `bin/route.mjs` | `README.md` — every flag documented there exists, and every flag in a usage string is documented |
| 10 | Policy files | `policies/*.md` on disk | `SKILL.md` "Which policy to read, when" — every policy file has a row, and every row points at a file that exists |

## Rules that keep it coherent

- **One concept, one name.** If a field is `model_effective` in the code, it is `model_effective` in
  every policy, schema and prompt. No "effective model", no `model_used`.
- **A registry beats prose.** Where a table in a policy and a registry disagree, the registry is
  changed to match the prose *or* the prose is changed to match the registry — in the same commit.
  Two readings never ship together.
- **Deprecated spellings are removed, not tolerated.** `telemetry-collector` (for
  `production-telemetry-collector`) and `vue-capacitor-frontend-specialist` (for
  `frontend-specialist`, which also kept an application stack's name in a generic core) were both
  removed; `tests/coherence.test.mjs` fails if either reappears.
- **New vocabulary gets a row here first.** Adding a task type, a role, a risk-floor area, a drawer
  or a routing field means adding it to its source of truth and to every restatement listed above,
  in one change.
