<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# llm-orchestrator

You write one line. The agent plans the work, splits it across parallel subagents, writes their
prompts, runs them, reviews the result, proves it works, and stops. You are not in the loop for any
of the steps in between.

```
/task "users can't reset their password from the mobile app"
```

That is the whole interface. What happens after you press enter:

| | |
|---|---|
| **Classifies** | Bug, feature, incident, refactor, investigation, review, deploy, config or research — each has its own workflow, gates and evidence rules. |
| **Reads your project** | Languages, frameworks, test and build commands, CI, plus any rules you wrote in `AGENTS.md`. Your rules tighten the defaults; they never get silently dropped. |
| **Builds a flow** | Phases, parallel groups, dependencies — each shard with its own scope, owner, acceptance conditions and iteration budget. |
| **Writes the prompts** | Each subagent gets a dispatch contract: the facts that shard needs, the tools it may use, what it must produce. Not a copy of the whole conversation. |
| **Picks a model per shard** | Cheap model for the mechanical shard, a strong one with high thinking for the hard shard — decided per shard at dispatch time against live pricing, not once for the whole task. |
| **Runs them in parallel** | Clean sessions, disjoint file ownership, so two agents cannot fight over the same file. |
| **Gates every phase** | `G0` plan approved → `G1` evidence complete → `G2` hypothesis valid → `G3` a test that actually fails → `G4` suite green → `G5` independent review passed → `G6` verified on the real surfaces. A phase does not start until the gate before it resolves. |
| **Proves it, then stops** | Completion claims need evidence: fresh local test output, not a subagent's summary. Then it checkpoints what it learned and cleans up its branches and worktrees. |

You get back a result that has been reviewed and verified, plus a written trail of what was decided
and why. If something is missing — a tool it needs, an ambiguous requirement — it says so up front
and asks you once, batched, instead of guessing or quietly doing less.

The rest of the command set:

```sh
/task "describe the work"        # the above, end to end
/task-plan "describe the work"   # plan only — see the flow before anything runs
/task-status                     # where the active work stands
/task-verify                     # re-run verification against acceptance evidence
/task-cancel                     # stop cleanly
/incident-start ...              # incident lifecycle: evidence -> fix -> verify -> close
```

Works on Claude Code, Codex, OpenCode and Kilo — the same flow, rendered into each one's native
commands and agents.

## Quick start

Pick the line that matches your harness. Everything is a dry run until you pass `--apply`.

### Claude Code — install as a plugin

No clone, no Node invocation. Type these two in any Claude Code session:

```
/plugin marketplace add tbogdan/llm-orchestrator
/plugin install llm-orchestrator@tbogdan
```

That registers the `orchestrate-core` skill straight from this repository, and `/plugin update
llm-orchestrator@tbogdan` keeps it current. The plugin ships the skill and its resources only — it
does not write project files. If you also want `.claude/commands/*.md`, the `.claude/agents/orchestrator.md`
agent and the `@AGENTS.md` line in `CLAUDE.md`, run the CLI install below with `--harness claude`.

### Codex, OpenCode, Kilo — install from npm

Node 22+. `npx` fetches the published package, so there is nothing to clone:

```sh
npx llm-orchestrator init    --project /path/to/app
npx llm-orchestrator install --project /path/to/app --harness codex    --apply
npx llm-orchestrator install --project /path/to/app --harness opencode --apply
npx llm-orchestrator install --project /path/to/app --harness kilo     --apply
npx llm-orchestrator install --project /path/to/app --harness claude   --apply
npx llm-orchestrator doctor  --project /path/to/app --harness <harness>
```

Prefer it on your PATH? `npm install -g llm-orchestrator`, then drop the `npx` prefix and call
`llm-orchestrator ...` directly.

### From a clone — development, or pinning a commit

```sh
git clone https://github.com/tbogdan/llm-orchestrator.git && cd llm-orchestrator
npm test
node bin/llm-orchestrator.mjs init    --project /path/to/app
node bin/llm-orchestrator.mjs install --project /path/to/app --harness <harness> --apply
```

### Which one to use

| Harness | Fastest install | What it gives you | Reload |
| --- | --- | --- | --- |
| Claude Code | `/plugin install llm-orchestrator@tbogdan` | the `orchestrate-core` skill | new session |
| Claude Code (full) | `npx llm-orchestrator install --harness claude --apply` | skill + commands + agent + `CLAUDE.md` binding | `/reload` or new session |
| Codex | `npx llm-orchestrator install --harness codex --apply` | `AGENTS.md` span, skill, `~/.codex/prompts/*.md` | new Codex session |
| OpenCode | `npx llm-orchestrator install --harness opencode --apply` | `.opencode/command(s)/*.md`, skill | restart `opencode` |
| Kilo | `npx llm-orchestrator install --harness kilo --apply` | `.kilo/command(s)/*.md`, skill | restart Kilo |

`init` is read-only: it proposes a `--harness` from what it finds in `/path/to/app` (or your home directory), shows the install plan it *would* run, and reports which of the [8 mandatory core tools](#the-8-mandatory-core-tools) are missing with the exact install command for each — nothing is written unless you pass `--apply` (which only appends the `AGENTS.md` bindings template if that section is missing; it never touches the install itself). Everything else in this README explains the same commands in more detail, per harness.

## Let an agent install it for you

Paste the block below into any capable coding agent (Claude Code, Codex, OpenCode, Kilo). It
installs the orchestrator itself without asking, then **stops and asks you once** before touching
anything else — installing third-party tools on someone's machine is not a decision an agent gets to
make silently.

````text
Install llm-orchestrator in this project, then report back.

STEP 1 — install the orchestrator (do this without asking):
  - On Claude Code: run `/plugin marketplace add tbogdan/llm-orchestrator` then
    `/plugin install llm-orchestrator@tbogdan`.
  - On any other harness, or if you also want the project files (commands, agent, AGENTS.md
    bindings): run `npx llm-orchestrator install --project . --harness <harness> --apply`,
    where <harness> is one of codex | claude | opencode | kilo.

STEP 2 — find the gaps (read-only, writes nothing):
  Run `npx llm-orchestrator init --project .`
  It prints each of the 8 mandatory core tools as [present] or [missing], with the exact
  install command for each missing one, and whether AGENTS.md has the orchestration
  bindings section.

STEP 3 — ASK ME BEFORE INSTALLING ANYTHING ELSE. Do not skip this step.
  Use your harness's native question mechanism (AskUserQuestion on Claude Code,
  request_user_input on Codex, question on OpenCode, ask_followup_question on Kilo).
  Ask once, batched, and include in the question:
    - the list of missing tools,
    - the exact command you would run for each,
    - that `brew install rtk` needs Homebrew and that the `/plugin` lines only work on
      Claude Code,
    - that declining is fine: the core still runs, in declared degraded mode.
  Then install exactly the ones I approve, and nothing I did not approve.

STEP 4 — verify and report:
  Run `npx llm-orchestrator doctor --project . --harness <harness>` and show me the output.
  Tell me plainly which tools are still missing and which gates are therefore degraded.
  Do not claim the install succeeded without showing the doctor output.
````

The same shape works as a standing instruction in `AGENTS.md`/`CLAUDE.md` if you want new sessions
to self-install. Keep step 3 intact if you do — an agent that installs MCP servers and Homebrew
formulae unprompted is a worse problem than a missing gate.

## Why

Ask an agent to fix a bug and you usually get one long session: it reads a bit, guesses, edits,
declares victory, and you find out later that nothing was verified. Ask it to parallelize and you
spend your afternoon writing subagent prompts by hand, then merging the mess when two of them edited
the same file.

The work that makes the difference is the same every time — classify the task, gather evidence
before theorizing, write a failing test first, split what can run in parallel, keep agents out of
each other's files, review independently, verify before claiming done, record what was learned. It
is mechanical, and nobody wants to re-type it into every prompt.

`llm-orchestrator` makes that flow the default. It ships as a skill your agent must load before it
does anything, so the process runs whether or not you remembered to ask for it, and it is written
once in portable form instead of being copy-pasted and left to drift across every project's
`AGENTS.md` and every harness's config.

## How it works

1. **Discover** — `lib/project-discovery.mjs` reads the project (languages, frameworks, domains, commands, and any `## Orchestration bindings (project)` section in AGENTS.md) into a `ProjectProfile`.
2. **Inventory** — the running session reports which tools/MCPs/skills it actually has, with permission and evidence, into a `ToolInventory`. Nothing is inferred from config files; only live, observed access counts.
3. **Resolve** — `lib/capability-resolver.mjs` combines the task, the project profile, the tool inventory, the registries (`registries/*.json`) and any explicit user decisions into a `CapabilityPlan`: which capabilities are mandatory/required/optional, which concrete tool binds each one, what's missing, and whether the plan is running in declared degraded mode.
4. **Dispatch** — `lib/dispatch-contract.mjs` narrows that plan into a `DispatchContract` for each bounded subagent shard: only the facts, bindings and acceptance conditions that shard needs.
5. **Render** — `adapters/*` turn the plan into native artifacts per harness (Codex prompts/AGENTS.md, Claude Code commands/agents/skills, OpenCode/Kilo commands/agents), installed atomically and idempotently by `lib/installation.mjs`.

### Obligation levels

- **Mandatory** — skipping it makes the work invalid, not merely worse. It is a gate. If it cannot run, the orchestrator states the gap *first*, recommends installation once (exact command), and only after an explicit user refusal continues in **declared degraded mode** — every plan, handoff and final report carries a `degraded:` line naming the missing item. Silent fallback is a violation.
- **Optional** — used when its stated trigger holds. Judgment call, but the trigger is not.
- **Available** — exists, costs nothing to ignore, reach for it when it fits.

### The 8 mandatory core tools

These apply to every task, everywhere, regardless of harness (see `registries/core-profile.json`):

| # | Capability | Preferred implementation | Why it's a gate |
|---|---|---|---|
| 1 | `orchestration.bootstrap` | using-superpowers | The orchestration entrypoint must load before any planning or execution. |
| 2 | `memory.recall` | mempalace | Prior session/task memory must be recalled before planning. |
| 3 | `memory.checkpoint` | mempalace | A memory checkpoint is required at session end and after any non-obvious finding. |
| 4 | `reasoning.checkpoints` | sequential-thinking | Nontrivial planning/diagnosis needs recorded evidence checkpoints. |
| 5 | `communication.concise` | caveman | Concise, complete contracts, not padded prose. |
| 6 | `shell.rtk` | rtk | Shell phases run through the configured output-reduction wrapper without changing command semantics. |
| 7 | `docs.current` | context7 | Version-sensitive or uncertain library/platform work needs current, versioned documentation — even for familiar libraries. |
| 8 | `research.retrieve` | exa (exa-search) | External/current facts, vendor behavior not in local docs, research-type tasks, and any claim about versions/prices/APIs need retrieved sources, not recalled ones. |

Four more gates are equally mandatory, at their own trigger rather than on every turn: `verification.checks` (verification-before-completion, before any completion claim), `skill.check` (before any action, check whether a skill already covers it), `tool.discovery` (search before declaring a tool absent), and `user.native_question` (every question to the user goes through the harness's native mechanism, batched into one question — `AskUserQuestion` on Claude Code, `request_user_input` / `update_plan` on Codex, `question` on OpenCode, `ask_followup_question` on Kilo; see `policies/questions.md`).

#### Installing the core tools

`llm-orchestrator init` reports which of these are missing and prints the matching command. The
routes below are the ones it prints — each was checked against the published source, because three
of them are not what the obvious guess would be: `rtk` on crates.io is an unrelated "Rust Type Kit",
and `mempalace-mcp` and `superpowers` are binaries their plugin ships rather than npm packages you
can `npx`.

| Capability | Tool | Install |
|---|---|---|
| `orchestration.bootstrap`, `skill.check`, `verification.checks` | using-superpowers | `/plugin marketplace add anthropics/claude-plugins-official` then `/plugin install superpowers@claude-plugins-official` |
| `memory.recall`, `memory.checkpoint` | mempalace | `/plugin marketplace add MemPalace/mempalace` then `/plugin install mempalace@mempalace` |
| `reasoning.checkpoints` | sequential-thinking | `claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking` |
| `communication.concise` | caveman | `/plugin marketplace add JuliusBrussee/caveman` then `/plugin install caveman@caveman` |
| `shell.rtk` | rtk | `brew install rtk` (Homebrew core; **not** `cargo install rtk`) |
| `docs.current` | context7 | `claude mcp add context7 -- npx -y @upstash/context7-mcp` |
| `research.retrieve` | exa | `claude mcp add exa -- npx -y exa-mcp-server` |
| `tool.discovery` | harness-native tool search | built in, nothing to install |

The `/plugin ...` lines are Claude Code commands, typed in a session. The `claude mcp add ...` lines
are shell commands; on Codex, OpenCode or Kilo, register the same MCP server through that harness's
own config instead — the server package and arguments are identical.

Every one of these is optional in the sense that the core still runs without it — but it then runs
in **declared degraded mode**, and every plan and report says so. That is the design, not a
workaround.

The eight rows above are `registries/core-profile.json` orders 1–8, in that order. The same eight, in the same order, appear in `SKILL.md`, `policies/capabilities.md` and the `task` command checklist, and `lib/first-run.mjs` checks exactly these for presence — `tests/coherence.test.mjs` fails if any of those six lists drifts.

### Registries

- `registries/capabilities.json` — the full capability vocabulary.
- `registries/core-profile.json` — the always-on mandatory/required core.
- `registries/task-mappings.json` — per-task-type (feature, bug, incident, refactor, investigation, review, deployment, config, research...) mandatory/optional/available obligations.
- `registries/preferred-tools.json` — concrete tool bindings (MCP, skill, CLI, workflow, native fallback, agent role) per capability, with install hints.
- `registries/agent-roles.json` — the specialist agent roster, their capabilities/skills/MCPs, and the RO/RW/ORCHESTRATOR permission profiles.

Project-specific bindings live in the consuming project's `AGENTS.md`, under `## Orchestration bindings (project)`; they can only **add or tighten** obligations, never loosen a core mandatory one.

## Install for your IDE

Dry runs by default — inspect conflicts, then repeat with `--apply`. Existing user-owned files are never silently overwritten.

```sh
npx llm-orchestrator install --project /path/to/app --harness codex
npx llm-orchestrator install --project /path/to/app --harness claude-code
npx llm-orchestrator install --project /path/to/app --harness opencode
npx llm-orchestrator install --project /path/to/app --harness kilo
```

`npx llm-orchestrator` (or the bare `llm-orchestrator` after `npm install -g llm-orchestrator`) is
the entry point. From a clone the same commands are `node bin/llm-orchestrator.mjs ...`; every
example below spells the clone form, and the npm form is identical minus the `node bin/…` prefix.
`node bin/install.mjs ...` (same options) still works underneath it.

`--skills-root` is optional: it defaults per harness (`codex` → `~/.agents/skills`, `claude` → `~/.claude/skills`, `opencode` → `~/.config/opencode/skills`, `kilo` → `~/.kilo/skills`), so the four commands above are already complete — pass `--skills-root <dir>` only to override that default. `claude`, `claude-code`, and `claude code` resolve to the same harness.

`--package-root <dir>` (where the package's own files are read from) and `--state-root <dir>` (where the installation manifest is kept; defaults to `$XDG_STATE_HOME/portable-orchestrator` or `~/.local/state/portable-orchestrator`) exist on `install`, `uninstall` and `init` for testing and for non-standard layouts — you normally leave both alone.

Multiple harnesses may share one explicitly enabled skill root using a comma-separated `--harness` value; when you don't pass `--skills-root` in that case it defaults to the shared `~/.agents/skills`, and *you* must ensure every selected harness is actually pointed at that root (see "Several harnesses at once" below). Add `--with-agents` to also render the per-harness orchestrator agent file (`.claude/agents/orchestrator.md`, `.opencode/agent/orchestrator.md`, `.kilo/agent/orchestrator.md`; no-op for Codex). Add `--link-claude` to have the installer create the `~/.claude/skills/orchestrate-core -> <skills-root>/orchestrate-core` symlink itself when Claude is one of several harnesses sharing a non-default root (idempotent; it never replaces a real directory). Restart/reload a session whose skill catalog is cached.

### Step by step

Same five steps for every harness; only the skills root and the reload differ.

1. **Get the package** (Node 22+) — either straight from npm:
   ```sh
   npx llm-orchestrator --help        # or: npm install -g llm-orchestrator
   ```
   or from a clone, when you want to read or pin the source:
   ```sh
   git clone https://github.com/tbogdan/llm-orchestrator.git
   cd llm-orchestrator && npm test
   ```
2. **Dry run** against your application — nothing is written, conflicts are listed:
   ```sh
   node bin/llm-orchestrator.mjs install --project /path/to/app --harness <harness>
   ```
3. **Apply** the same command with `--apply`. Re-running is idempotent; a file you edited by hand is reported as a conflict, never overwritten.
4. **Add project bindings** to `/path/to/app/AGENTS.md` (template below, or run `init --apply` to append it automatically when the section is missing). The core reads this section on every task; without it the core still runs with its generic matrix.
5. **Verify and reload**: `node bin/llm-orchestrator.mjs doctor --project /path/to/app --harness <harness>` must list every mandatory core tool as `present` (or as a declared gap with an install hint). Then reload the harness session so the skill catalog is refreshed.

`node bin/llm-orchestrator.mjs init --project /path/to/app` runs steps 2, 4 (report only) and 5 together, before you commit to a harness — it proposes `--harness` from what it detects, shows the same dry-run plan, and lists exactly which of the 8 mandatory tools are missing with an install command for each.

| Harness | `--harness` | `--skills-root` | Where things land | Reload |
| --- | --- | --- | --- | --- |
| Codex | `codex` | `~/.agents/skills` (default) | `AGENTS.md` span, `.agents/skills/orchestrate/SKILL.md`, `~/.codex/prompts/*.md` | new Codex session |
| Claude / Claude Code | `claude` | `~/.claude/skills` (or symlink it to `~/.agents/skills/orchestrate-core`) | `.claude/commands/*.md`, `CLAUDE.md` gets `@AGENTS.md`, `--with-agents` → `.claude/agents/orchestrator.md` | `/reload` or new session |
| OpenCode | `opencode` | `~/.config/opencode/skills` | `.opencode/commands/*.md`, `--with-agents` → `.opencode/agent/orchestrator.md` | restart `opencode` |
| Kilo | `kilo` | `~/.kilo/skills` | `.kilo/commands/*.md`, `--with-agents` → `.kilo/agent/orchestrator.md` | restart Kilo / `kilo debug skill --pure` to confirm discovery |

Several harnesses at once: `--harness codex,claude,opencode,kilo --skills-root ~/.agents/skills`, then make sure each IDE is pointed at that root (Claude Code accepts a personal skill-folder symlink; OpenCode and Kilo need the root enabled in their config).

#### Project bindings template (paste into AGENTS.md)

```markdown
## Orchestration bindings (project)

Generic rules live in `orchestrate-core`; this section only adds or tightens.

**Mandatory on every task (project):**

| What | When |
|---|---|
| `<your compat / schema / lint check command>` | any API or schema change |

**MCP servers confirmed live:** `context7`, `mempalace`, `<your MCPs>`. If a call fails, say the server is unreachable — never silently fall back.

**Per task type (Mandatory | Optional (trigger) | Available):**

| Task type | Mandatory | Optional | Available |
|---|---|---|---|
| FEATURE | failing test first | `context7` (any library API) | … |
| BUG_FIX | reproduce before fixing | `playwright` (UI-visible) | … |

**Risk floors (override upward only):** `<area>` → implementation `<tier>`, independent review `<tier>`.

**Agent defaults:** `<role>` → `<tier>` (W T0–T1 / S T2 / S T3 / X T3 …).
```

### Per-harness notes

- **Codex** reads `AGENTS.md` plus `.agents/skills/*/SKILL.md`; custom prompts install to `~/.codex/prompts/*.md` (or `--codex-prompts-root <dir>`); subagents dispatch via `spawn_agent`, plans via `update_plan`.
- **Claude Code** installs `.claude/commands/*.md`, `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, and adds `@AGENTS.md` to `CLAUDE.md`; subagents dispatch via the Agent tool.
- **OpenCode** installs `.opencode/command(s)/*.md`, `.opencode/agent/*.md`, skills under `~/.config/opencode/skills`; subagents dispatch via the task tool. Sequential Thinking's permission key is `sequentialthinking_sequentialthinking`.
- **Kilo** installs `.kilo/command(s)/*.md`, `.kilo/agent/*.md`, skills under `~/.kilo/skills`/`.kilo/skills`; Agent Manager worktrees live under `.kilo/worktrees/`. Same Sequential Thinking permission key as OpenCode.

### Uninstall

```sh
node bin/llm-orchestrator.mjs uninstall --project /path/to/app --harness codex
node bin/llm-orchestrator.mjs uninstall --project /path/to/app --harness codex --apply
```

Dry run first, then `--apply`. It removes only unchanged, package-owned files it installed — never a file a human has since edited, and never user tools or provider credentials. A hand-edited `AGENTS.md` span or command file is reported under `preserved`, left exactly as you wrote it, and the (now orphaned) manifest entry for it is dropped so a future reinstall treats it as fresh. The shared `orchestrate-core` runtime under `--skills-root` is only removed by uninstalling the last project that references it; `retained_shared_runtime` in the JSON output lists what stayed.

## Using it from an already-installed project

Once a harness has the core installed and its skill catalog reloaded, nothing further is required from you: the harness's own bootstrap step (Codex's `AGENTS.md` sentence, Claude's `@AGENTS.md` import, or the native `/orchestrate`-style command) loads `orchestrate-core` on the **first prompt of the session**, before any planning happens. That load does three things in order:

1. **Bootstrap** — the entrypoint skill is discovered and read (this is itself the first of the 8 mandatory core tools).
2. **Mandatory check** — the remaining 7 core tools (`memory.recall`/`memory.checkpoint` via MemPalace, `reasoning.checkpoints` via Sequential Thinking, `communication.concise` via caveman, `shell.rtk`, `docs.current` via context7, `research.retrieve` via Exa) are checked for live evidence, not assumed present from a config file.
3. **Degraded rule** — for any of those that are missing, the orchestrator states the gap *first*, recommends the exact install command once, and only continues after an explicit user refusal — carrying a `degraded: <capability>` line on every plan, handoff and final report from then on for that session. It never falls back silently.

From there, the `/task` family (`/task`, `/task-plan`, `/task-status`, `/task-verify`, `/task-cancel`) and the `/incident-*` lifecycle commands are available in whatever native form the harness renders (see "Usage once installed" below). Cost-aware routing is available directly from the shell at any time:

```sh
node bin/llm-orchestrator.mjs route --task FEATURE --phase implementation --role backend-fixer --complexity MODERATE --harness claude
```

This resolves (task type, phase, role, risk, complexity, context size, harness) to a tier, thinking level, a ranked list of eligible models with a $/task estimate, the independent-review floor and the fan-out minimum — the same resolution the orchestrator uses internally, callable standalone for planning or auditing a routing decision.

## Cost-aware routing (built in)

Routing is data, not prose: `registries/routing-matrix.json` encodes the W/S/X/F tiers, the T0–T5 thinking levels with their per-provider controls (`effort` on Claude, `reasoning_effort` on Codex, budget-only on Haiku), the tier × thinking resolution table, default routing, the per-task-type flows (phase → pair → roles → gate), 21 risk-floor areas with implementation and independent-review floors, agent defaults, both escalation ladders, fan-out minimums (2 MODERATE / 3 COMPLEX / 4 CRITICAL), the target tier distribution and the quota degradation ladder. `models/top-models.json` carries the curated top 20 models — ten ladder incumbents and ten measured candidates — with their supported thinking levels, prices, measured $/task per effort and thinking-cost indices (Artificial Analysis snapshot, copied verbatim, never invented). `lib/router.mjs` resolves a dispatch; `bin/route.mjs` exposes it:

```sh
node bin/llm-orchestrator.mjs route --list                                   # vocab: task types, phases, roles, areas
node bin/llm-orchestrator.mjs route --task BUG_FIX --phase fix --area refund --risk critical --harness codex
node bin/llm-orchestrator.mjs route --task FEATURE --complexity COMPLEX --flow --provider anthropic   # whole flow, $ estimate, tier histogram
node bin/llm-orchestrator.mjs route --task FEATURE --phase implementation --include-candidates --cheapest-thinking
```

- `--include-candidates` ranks the ten measured candidates alongside the incumbents. They are held out by default, and an exposed candidate in a runtime inventory is admitted for noncritical lanes only — never for an independent-review seat, a T4/T5 pair or a risk-floor review row, and not for the implementation seat of a dispatch that requires an independent reviewer.
- `--cheapest-thinking` (with `--max-score-loss <n>`, default 2) returns the lowest-cost (model, effort) whose measured score is within that many displayed points of the incumbent config for the resolved pair — the thinking-cost optimisation, in one line.
- `--kind <default-routing kind>` overrides the starting row of the resolution order; `--context-tokens <n>` feeds the context axis (worker window cap, >272K repricing cliff); `--json` prints the machine-readable form of any of the above.

Resolution order: default routing → agent default → task-flow phase → complexity → risk floor (upward only) → context rules (Haiku 200K cap, Codex >272K repricing) → caps (Terra/Sol never above `high`, Fable 5.1 only with `--explicit-fable-5-1`). A runtime inventory (`--inventory`) filters the ranking to models actually exposed in the session.

### Per-shard selection, not per task

The CLI resolves one dispatch. Inside a flow, the same resolution runs **for every PlanShard, at dispatch time, against the live inventory** — `lib/dispatch-contract.mjs` exposes `buildShardRouting(shard, options)` for one shard, `buildShardContracts(flow, { inventory, harness, includeCandidates })` for all of them (returning the flow ledger: tier histogram against the target distribution, mean `$/task`, blocked shards, warnings), and `rerouteRemaining(flow, inventory)` when a model-not-found, a rejected effort or a quota change invalidates the inventory mid-flow — remaining shards only, so the ledger stays true. Each shard carries a `routing` block with exactly these thirteen fields: `pair`, `tier`, `thinking_level`, `model_requested`, `effort_requested`, `model_effective`, `effort_effective`, `review_floor`, `independent_review`, `selection_reason`, `inventory_revision`, `price_source`, `est_usd_per_task`. An inventory that exposes nothing eligible for the resolved tier yields `blocked: "no eligible model"` — the floor is never lowered to fit what happens to be available.

### Top 20 models and thinking levels (snapshot 2026-09-22)

Incumbents hold a seat on a provider ladder. Candidates are measured but unseated: their tier is a `tier_bands` placement from the best measured Artificial Analysis score (W ≤ 37, S 38–44, X 45–50, F ≥ 51), and they rank only with `--include-candidates` or an inventory that exposes them.

| Model | Provider | Ladder | Admission | Tier | Thinking levels | $ in / out per MTok |
|---|---|---|---|---|---|---|
| GPT-5.6 Luna | openai | codex | incumbent | W | low, medium, high, xhigh, max (reasoning_effort) | $0.2 / $1.2 |
| GPT-5.6 Terra | openai | codex | incumbent | S | low, medium, high, xhigh, max (reasoning_effort) | $2 / $12 |
| GPT-5.6 Sol | openai | codex | incumbent | X | low, medium, high, xhigh, max (reasoning_effort) | $4 / $20 |
| GPT-6 Astra | openai | codex | incumbent | F | low, medium, high, xhigh, max (reasoning_effort) | $10 / $50 |
| Claude Haiku 4.5 | anthropic | claude | incumbent | W | disabled, enabled (budget_tokens) | $1 / $5 |
| Claude Sonnet 5 | anthropic | claude | incumbent | S | low, medium, high, xhigh, max (effort) | $2 / $10 |
| Claude Opus 5 | anthropic | claude | incumbent | X | low, medium, high, xhigh, max (effort) | $5 / $25 |
| Claude Fable 5 | anthropic | claude | incumbent | F | low, medium, high, xhigh, max (effort) | $10 / $50 |
| Claude Fable 5.1 | anthropic | claude | incumbent | F | low, medium, high, xhigh, max (effort) | $10 / $50 |
| Grok 4.7 | xai | — | incumbent | — (unrated) | low, medium, high, xhigh (reasoning_effort) | $2 / $6 |
| Muse Spark 1.3 | muse | third-party | candidate | X (48) | xhigh, max (provider-default) | $1.25 / $4.25 |
| Grok 4.6 | xai | third-party | candidate | S (44) | low, medium, high, xhigh (reasoning_effort) | $2 / $6 |
| MiMo V2.6 Pro | xiaomi | third-party | candidate | X (46) | default (provider-default) | $0.435 / $0.87 |
| Gemini 3.8 Flash | google | third-party | candidate | S (41) | low, medium, high (provider-default) | $0.75 / $3.75 |
| Qwen3.8 Max | alibaba | third-party | candidate | X (45) | default (provider-default) | $2 / $6 |
| GLM 5.3 | z.ai | open | candidate | X (45) | max (provider-default) | $1.4 / $4.4 |
| GLM 5.3 Flash | z.ai | open | candidate | S (42) | default (provider-default) | $0.15 / $0.5 |
| Kimi K3 | moonshot | open | candidate | S (44) | low, max (provider-default) | $3 / $15 |
| DeepSeek V4.1 Flash | deepseek | open | candidate | S (39) | max (provider-default) | $0.3 / $1.2 |
| MiniMax M3 | minimax | open | candidate | W (29) | default (provider-default) | $0.3 / $1.2 |

`control: provider-default` means the real thinking parameter is unverified for that model — dispatch the provider default and never send an invented effort enum. Data retention and endpoint eligibility are unknown for every candidate: no secrets, PII, production tokens or credential-bearing code.

Prices and measured costs are dated evidence, not live tariffs; refresh `models/` before relying on the numbers.

## Updating

From npm — `npx` always resolves the latest published version, so there is nothing to pull:

```sh
npx llm-orchestrator@latest install --project /path/to/app --harness <harness> --apply
```

From a clone:

```sh
git -C llm-orchestrator pull
node bin/llm-orchestrator.mjs install --project /path/to/app --harness <harness> --apply
```

In Claude Code, the plugin updates on its own terms: `/plugin update llm-orchestrator@tbogdan`.

Re-running `install --apply` after an update is the entire update procedure — it is the same idempotent apply as a fresh install. Files the package generated and you haven't touched are refreshed to the new version; a project file you hand-edited (an `AGENTS.md` bindings section, a command you customized) is reported as a **conflict** and left untouched — nothing is overwritten silently. Resolve a reported conflict by reviewing the diff yourself and either keeping your edit or deleting the file so the next apply can regenerate it.

## Usage once installed

The command set is listed at the top of this README. Exact command names and argument shapes are rendered per harness by `adapters/commands.mjs`; run `--help` on any installed command for the harness-native form.

## Development

```sh
node --test tests/*.test.mjs tests/models/*.test.mjs
node bin/llm-orchestrator.mjs doctor --project /path/to/app --harness codex
node bin/llm-orchestrator.mjs check
node bin/attribution-check.mjs --fix
```

`docs/COHERENCE.md` names, for each cross-reference class (field names, drawer names, the 8 mandatory tools, task types, agent roles, risk-floor areas, gate labels, the bridge text, CLI flags, policy references), which file is the single source of truth. `tests/coherence.test.mjs` checks those classes mechanically, so drift fails CI instead of being discovered by a reader.

`doctor` prints project bindings, resolved mandatory gaps, and the recommended install command for each — read-only, no mutation. `check` (== `bin/attribution-check.mjs`) verifies every package-owned file carries the attribution marker described below; `--fix` inserts a missing one at the correct position for that file type. `tests/e2e-install.test.mjs` drives the real CLI as a subprocess (temp `HOME`/`XDG_STATE_HOME`, no writes outside the test's own temp directories) through install → doctor → init → uninstall for all four harnesses, plus a realistic fixture project and a `--with-agents` run; `tests/cli.test.mjs` covers help text, unknown subcommands and `check`.

## Troubleshooting

- **A newly installed skill isn't discovered.** The harness caches its skill catalog per session — reload it (`/reload` in Claude Code, a new Codex session, restarting `opencode`/Kilo, or `kilo debug skill --pure` to confirm discovery) after any `install --apply`.
- **`install`/`uninstall` reports a conflict.** That path was hand-edited since the last install (or was never installer-owned to begin with). Nothing was overwritten. Diff it yourself; either keep your version or delete the file so the next `--apply` can (re)generate it. Multiple harnesses claiming inconsistent content for the same shared file (e.g. two different renders of the bridge) also surfaces as a conflict — install one harness at a time in that case, or confirm they'd render identically first.
- **A mandatory tool is reported missing.** Run `init` (or `doctor`) — both print the exact install command from `registries/preferred-tools.json` for each gap. Until it's installed, the orchestrator runs in declared degraded mode for that capability; it does not pretend the tool is present.
- **`--skills-root is required` no longer appears.** It used to be mandatory for non-Codex harnesses; it now defaults per harness (see "Install for your IDE"). If several harnesses share a root, make sure each IDE's own config actually points at it — `install` cannot verify a harness's native skill-discovery configuration for you, only render the files.
- **`route` says "not available in this build".** `bin/route.mjs` ships from a separate work stream in this package; if it's missing from your checkout, cost-aware routing isn't available yet — everything else in this README works independently of it.

## Attribution

Every file this package owns (registries, schemas, lib, bin, adapters, tests, and every file the installer generates into a consuming project) carries a hidden-but-machine-readable attribution marker:

- Markdown: line 1, or immediately after frontmatter's closing `---`.
- JS/MJS: line 1, or line 2 after a shebang.
- JSON: `"_attribution"` as the first key of the root object.

Keep the credit line when copying or deriving from this project.

## License

[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/). Use, copy, adapt and redistribute freely, including commercially, as long as you credit **Bogdan-Gabriel Torcescu** (https://www.linkedin.com/in/bogdantorcescu/), link the license, note your changes and keep the embedded attribution markers. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Copyright (c) 2026 Bogdan-Gabriel Torcescu — https://www.linkedin.com/in/bogdantorcescu/
