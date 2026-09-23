<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# CRITIC — Cost-Aware Model and Thinking Routing

Goal: **the cheapest model that solves the task reliably, with the smallest thinking level that is
sufficient.** Do not automatically map "hard task" to the biggest model, and do not automatically
pair a big model with maximum thinking.

These rules are **provider-neutral**. Every dispatch is classified into a *tier* and a *thinking
level*; the provider you are running on resolves that pair to a concrete model via the tables below.
The same task must land on the same tier regardless of provider.

**A harness is not a provider.** Codex, Claude Code, OpenCode and Kilo may expose different model
sets on different installations. A public catalog entry, a benchmark row, or credentials in a config
file does not prove the current agent can dispatch that model. Do not launch another harness,
install providers or spend inference credits merely to discover availability.

## Machine-readable form

This policy is executable. Everything below — tiers, thinking levels, the tier × thinking resolution
table, default routing, the flow matrix, risk floors, agent defaults, the escalation ladders, fan-out
minimums, caps, the target distribution and the quota degradation ladder — is encoded in
`registries/routing-matrix.json` (schema: `schemas/routing-matrix.schema.json`). The model shortlist
with prices, thinking controls, context windows and measured cost per task lives in
`models/top-models.json` (schema: `schemas/top-models.schema.json`), whose `measured` values are
copied verbatim from `models/model-thinking-data.json`.

`lib/router.mjs` applies them (`classify`, `rankModels`, `cheapestThinkingFor`, `estimateFlow`,
`explain`) and `bin/route.mjs` exposes them:

```bash
node bin/route.mjs --task BUG_FIX --phase fix --area refund --risk critical --harness codex
node bin/route.mjs --task FEATURE --flow --complexity COMPLEX --provider openai --json
node bin/route.mjs --task FEATURE --phase implementation --include-candidates --cheapest-thinking
node bin/route.mjs --list        # task types, phases, roles, risk-floor areas, and the 20 models
```

`classify` resolves in this order: default routing → agent default → task-flow phase → complexity →
risk floor (upward only) → context rules → caps. Risk raises the **review** floor, never the
implementation tier — "route by risk, not by LOC" is mechanised, not merely advised. `rankModels`
excludes configurations that violate a cap (Terra/Sol above `high`, Fable 5.1 without an explicit
flag) rather than clamping them silently, and intersects with a runtime inventory when one is passed.
It also enforces admission: a model marked `admission: "candidate"` is returned with an
`excluded_reason` instead of a seat unless the caller opts in — see "Candidate alternatives and
admission". `cheapestThinkingFor(pair, { maxScoreLoss })` is the thinking-cost optimisation: for the
tier a pair resolves to, it returns the lowest-cost (model, effort) whose measured score is within
`maxScoreLoss` (default 2) of the incumbent config the resolution row names.

One deliberate registry decision: `agent_defaults` is taken from the Agent-defaults table below
wherever `registries/agent-roles.json` disagreed — the prose wins, and the registry matches it. The
`concurrency` risk-floor row (X T3 implementation / X T4 review) is derived from the
"security/payments/concurrency/migrations → X T4" default-routing line and is now tabulated
explicitly in "Risk floors" below, so registry and prose carry the same 21 areas under the same keys.

## Discovery before dispatch

1. Inspect the active session's model picker, collaboration tool schema or supported read-only
   model-list endpoint. Record `harness`, version, timestamp, source, exact IDs, provider and
   supported effort values.
2. Distinguish **exposed** (the current runtime advertises dispatch), **configured** (listed but
   dispatch not established) and **verified** (a successful prior dispatch in this same context).
   Unknown access or effort stays unknown. Never emit credentials, config dumps or auth headers.
3. Intersect that inventory with the tables below. An unrecognized model is available-but-unrated:
   it gets neither an invented score nor automatic promotion to critical reviewer.
4. Refresh at session start, on account/provider/workspace change, on a model-not-found or
   effort-rejection error, and on a quota change. A saved inventory is evidence, never a permanent
   allowlist.
5. **Record `model_requested` and `model_effective`** (and `effort_requested` / `effort_effective`).
   A runtime substitution that violates a floor invalidates that phase. Do not silently fall back.

On OpenCode and Kilo, resolve the actual `provider/model` identifier and variant from the runtime;
the incumbents below are role mappings, not guarantees of availability.

## Tiers and provider models

| Tier | Role | Claude incumbent | Codex incumbent |
| --- | --- | --- | --- |
| **W** worker | local, mechanical, repetitive, well-defined: code search, classification, extraction, small edits, boilerplate, simple tests, consistency checks, scoped transforms | Haiku 4.5 (`claude-haiku-4-5`) | `gpt-6-luna`, falling back to `gpt-5.6-luna` |
| **S** standard | default software-engineering model: normal implementation, frontend/backend, moderate debugging, tests, reasonable multi-file refactors, codebase analysis, tool use | Sonnet 5 (`claude-sonnet-5`) | `gpt-5.6-terra` |
| **X** senior | hard debugging, architecture, concurrency, migrations, security, auth, payments, billing, backwards compatibility, critical code review, many invariants | Opus 5.5 (`claude-opus-5-5`), falling back to Opus 5 (`claude-opus-5`) | `gpt-6-sol`, falling back to `gpt-5.6-sol` |
| **F** frontier | exceptional escalation: very ambiguous, long-horizon, cross-system, major architecture, very large codebase, planning under heavy constraints, or when X fails to produce a solid solution | Fable 5 (`claude-fable-5`) — default F. Fable 5.1 (`claude-fable-5-1`) is a hard-capped exception: **≤2% of all dispatches**, explicit request or documented F-T4 failure on Fable 5 only | GPT-6 Astra (`gpt-6-astra`) — a real single-agent frontier tier, no decomposition workaround needed |

Escalation order within a provider: **W → S → X → F**.

Verified prices (Sep 2026, provider pricing pages), USD in/out per MTok:

| Tier | Claude model | Claude $ in/out | Codex model | Codex $ in/out |
| --- | --- | --- | --- | --- |
| W | Haiku 4.5 (200K ctx) | $1 / $5 | `gpt-6-luna` (1.05M ctx); fallback `gpt-5.6-luna` $0.20 / $1.20 | $0.10 / $0.50 |
| S | Sonnet 5 (1M ctx) | $2 / $10 | `gpt-5.6-terra` (1.05M ctx) | $2 / $12 |
| X | Opus 5.5 (1M ctx); fallback Opus 5 $5 / $25 | $4 / $20 | `gpt-6-sol` (1.05M ctx); fallback `gpt-5.6-sol` $4 / $20 | $2 / $10 |
| F | Fable 5 (1M ctx) | $10 / $50 | `gpt-6-astra` (1.05M ctx) | $10 / $50 list — **but the cheapest F per completed task of any model here** |
| F+ (≤2%) | Fable 5.1 (1M ctx) | $10 / $50 list — **effective cost significantly higher** (always-on thinking, longer turns, more output tokens per task) | — (Astra covers F) | — |

Claude notes: Fable 5.1 shares Fable 5's list price but costs significantly more per completed task
— judge it on cost per task, not per token. **When F is needed, use Fable 5; Fable 5.1 is capped at
≤2% of dispatches.** Fable 5.1 cache reads bill at $0.25/MTok; Fable 5 uses the standard
10%-of-input cache-read rate. Opus 5.5 is at or below Opus 5 on every per-token price (input $4 vs $5,
output $20 vs $25, cache read $0.20 vs $0.50, cache write $5 vs $6.25); only its `max` effort is
independently measured so far, so the router ranks it ahead of Opus 5 by `supersedes` price
succession — never by an estimated $/task — and keeps Opus 5 as the fallback when 5.5 is not exposed
or refuses. Opus 5.5's API default effort is `medium`, one below Opus 5, so X always sets effort
explicitly. Fast mode (`speed: "fast"`) reprices Opus 5.5 to $8 / $40 and Opus 5 to $10 / $50 —
never a replacement for an F dispatch, off by default.
Legacy fallbacks: Opus 4.8 / 4.7 / 4.6 $5 / $25, Sonnet 4.6 $3 / $15 (more expensive than Sonnet 5 —
never pick it for cost).

Codex notes: all three gpt-5.6 models have a 1,050,000-token window and 128K max output.
**Long-context surcharge: a request whose input exceeds 272K tokens bills the *entire request* at 2x
input and 1.5x output** — Luna $0.40/$1.80, Terra $4/$18, Sol $8/$30. Cached reads are 10% of input;
cache *writes* bill at 1.25x uncached input. Legacy `gpt-5.5` ($5/$30) and `gpt-5.4` ($2.50/$15) are
capped at 272K — more expensive *and* smaller-context than the tier that replaces them, so they are
fallback-only.

Astra: `low`/`medium`/`high`/`xhigh`/`max` on the public API. (`none` exists in prerelease
evaluations only and is **not** publicly callable — never dispatch it.)

## Cost per task ≠ price per token

Cost-per-completed-task figures come from a public benchmark suite with its own weighting — not from
a consuming project's workload. They do not track list price, because thinking-token volume varies
enormously between models at the same effort:

| Config | Score | $/task | Read |
| --- | --- | --- | --- |
| Haiku 4.5 thinking on | 22 | $0.20 | W floor |
| Luna `xhigh` / `max` | 42 / 43 | $0.06 / $0.10 | cheapest measured anything |
| Terra `high` / `max` | 41 / 47 | $0.30 / $0.81 | |
| Sol `low` / `medium` / `high` / `max` | 41 / 46 / 48 / 51 | $0.23 / $0.37 / $0.61 / $1.25 | X tier, cheap |
| **Astra `high`** | **53** | **$1.41** | **best score-per-dollar at the top** |
| Astra `medium` / `xhigh` / `max` | 52 / 54 / 55 | $1.16 / $1.85 / $2.57 | |
| Opus 5 `medium` / `high` / `xhigh` / `max` | 50 / 52 / 53 / 54 | $1.36 / $2.44 / $3.36 / $4.21 | |
| Sonnet 5 `max` | 45 | $3.31 | only measured Sonnet point |
| Fable 5 `max` | 53 | $5.62 | |
| Fable 5.1 `max` | 57 | $6.12 | highest score measured, highest cost |

**Which numbers bind.** The two tables in this section are an earlier reading and they do **not**
match the machine-readable dataset: `models/model-thinking-data.json` (Artificial Analysis v4.3.2,
observed 2026-09-22) records Luna `xhigh` at 35 @ $0.09 rather than 42 @ $0.06, Astra `high` at 51 @
$1.73 rather than 53 @ $1.41, Opus 5 `medium` at 45 @ $2.19 rather than 50 @ $1.36, and Fable 5.1
`max` at 53 @ $7.63 rather than 57 @ $6.12. **Where prose and dataset disagree, the dataset wins** —
it is what the router reads and what `bin/model-thinking-report.mjs` renders. Two of the frontier
rows below also fall off the frontier under that data: **Sol `xhigh`** is dominated by Astra `low`
(46 @ $0.82 vs 44 @ $1.18) and **Fable 5.1 `max`** is dominated by Astra `max` (same 53 at less than
half the cost). Everything else in this section — the shape of the argument, the dominated list, the
Terra verdict, "never run Sonnet at `max`" — survives both readings unchanged.

### The efficient frontier — pick by $/task, not by tier label

A config is on the **efficient frontier** if no cheaper config scores at least as high. Everything
else is *dominated* — strictly worse on both axes, never the right default.

| Frontier config | Score | $/task |
| --- | --- | --- |
| Luna `xhigh` | 42 | $0.06 |
| Luna `max` | 43 | $0.10 |
| Sol `medium` | 46 | $0.37 |
| Sol `high` | 48 | $0.61 |
| Astra `low` | 49 | $0.63 |
| Sol `xhigh` | 50 | $0.89 |
| Astra `medium` | 52 | $1.16 |
| Astra `high` | 53 | $1.41 |
| Astra `xhigh` | 54 | $1.85 |
| Astra `max` | 55 | $2.57 |
| Fable 5.1 `max` | 57 | $6.12 |

Dominated, with what beats them: Haiku 4.5 (22 @ $0.20 — Luna `xhigh` is 3.3x cheaper *and* 20
points higher), Sol `low`, Terra `high` (5x), Terra `xhigh`, Terra `max`, Sol `max`, Opus 5
`low`/`medium`/`high` (2.1x)/`xhigh` (2.4x)/`max` (2.3x), **Sonnet 5 `max`** (45 @ $3.31 — Sol
`medium` is 8.9x cheaper for a higher score), **Fable 5 `max`** (53 @ $5.62 — Astra `high` is 4x
cheaper for the same score).

Read that as the default *preference* when a task is provider-flexible, and weigh it against limits
the price data cannot see:

- **The benchmark suite is not your workload.** Ratios transfer better than absolute dollars.
- **Sonnet 5 is measured only at `max`**, its worst-value point. Its lower efforts are unrated, not
  proven bad. The safe conclusion is narrower: never run Sonnet at `max`.
- **Score is not reliability.** On the strict end-to-end "fully resolved" cut the ranking reorders.
- **Risk floors, retention and independence still bind** and are not priced here. A cheaper frontier
  config never overrides a risk-floor row.
- **Quota reality**: subscription windows are not per-token billing. See "Quota windows".

**Terra is the squeezed tier.** Every measured Terra config is dominated. Two conclusions of
different strength: **firm — never run Terra above `high`** (Sol `medium` is cheaper and
higher-scoring than Terra `xhigh`; Sol `high` beats Terra `max`; escalate the model, never the dial);
**provisional — Terra `high` as the standard review config is worth re-examining**, but score is not
capacity and Terra `medium` (the actual S T2 default) has no measured point, so the S tier is not
indicted as a whole. Test it on real tasks; do not move reviews onto a small model today.

Benchmark hygiene: fallback-assisted runs are labelled as such and must not be read as clean
measurements. Where a headline number depends on fallback credit, treat that model's figure as
unmeasured rather than good.

Relative **list** cost within each provider (vs its own W tier): Claude 1x / 2x / 5x / 10x; Codex
1x / 10x / 20x / 50x — the Codex W→S jump is much steeper, so keeping mechanical work on the W model
matters even more there. Per *task*, the real spread is far narrower at the top and far wider at the
bottom. Both readings matter: list price governs a long-context single call, $/task governs a flow.

## Context as a routing axis

Context windows are not uniform: the Claude S/X/F models carry 1M context (128K max output) while
the W model is capped at 200K. On Codex all models take ~1.05M, but input beyond 272K bills at the
premium rate.

- **Context can force escalation independent of difficulty.** A mechanical task over a >150K-token
  working set is not a W dispatch on a 200K model — it will truncate or thrash. Route it S T0–T1, or
  shard the input so each W dispatch stays well under the window.
- **Don't pay for context you don't ship.** A small, well-scoped task does not justify a 1M model
  "just in case". Give subagents trimmed inputs.
- **>150K conversations**: prefer chunking/sharding for W work; for long-horizon single-agent runs,
  server-side compaction on the 1M models is a factor before escalating to F purely for size.
- **Where every model is large-context, the window floor does not apply** — the constraint is
  pricing, not capability.
- **The >272K pricing cliff**: input past 272K reprices the **whole request** — one token over the
  line raises the cost of everything before it. Shard below 272K whenever the task allows; at that
  size, recheck the provider choice, and treat any >272K dispatch as a tier bump in the cost ledger.
  Where a model's long-context repricing is not documented, assume it may apply and prefer the
  known-flat-priced option.

Thinking tokens bill as **output** — high thinking is real cost. **F is NOT the default for every
hard task**: on pure hard coding, X is within noise of frontier at a fraction of the price. F earns
its premium only when several of these stack: long horizon + ambiguity + many subsystems + huge
context + planning under incomplete information + architectural judgment. For hard coding alone, try
X before F.

Only name models callable by the current tooling. Never use date-suffixed IDs.

## Thinking levels (separate axis from model)

| Level | Use | Claude `effort` | Codex `reasoning_effort` |
| --- | --- | --- | --- |
| T0 | mechanical: copy, grep, formatting, trivial edit | none/disabled | `low` |
| T1 | local, well-defined task | `low` | `low` |
| T2 | standard implementation, moderate reasoning | `medium` | `medium` |
| T3 | multi-file reasoning, review, debugging, serious planning | `high` | `high` |
| T4 | very hard debugging, security, money, concurrency, migrations, architecture, critical compatibility | `xhigh` | `high` + independent second reviewer on gpt-5.6; `xhigh` on Astra |
| T5 | frontier-only; can over-think simple tasks — diminishing returns | `max` | Astra `max` only; not available on gpt-5.6 |

Claude: S/X/F models take effort levels directly; X defaults to `high`. Start F at `high`, not
xhigh/max. Fable 5.1 API rules (rare): thinking is always on (omit `thinking` or send `adaptive`;
`disabled` and `budget_tokens` return 400); forced `tool_choice` `any`/`tool` returns 400 — use
`auto` + instruction, `strict: true`, or structured outputs; no assistant prefill; thinking blocks
are bound to the model and the transcript must stay append-only; per-message `effort` via a
mid-conversation `system` message avoids cache resets. **The W model has no effort parameter** —
only `thinking: enabled + budget_tokens`. Map T0/T1 = thinking off, T2 = small budget, T3 = moderate
budget; if it would need T4+, escalate to S instead of inflating the budget. A small model that
thinks a lot does not become a frontier model — thinking and model size are not substitutes.

Codex: `high` is the **ceiling for Terra and Sol** — never dispatch `xhigh` or `max` there; escalate
the model instead. (Sol `xhigh` at $0.89/task is on the frontier and is a legitimate exception when
Astra `medium` is unavailable; Sol `max` is dominated and never correct.)

**Luna is the exception.** Luna `xhigh` scores 42 @ $0.06/task and `max` 43 @ $0.10 — both
higher-scoring and 3–5x cheaper than Terra `high`. **Run W-tier work at Luna `xhigh` by default,
`max` when it stalls.** Thinking is cheap on a small model; that is exactly where high effort pays.
Escalate to S when the task needs **capacity** — judgment, cross-file scope, ambiguity, context
beyond what a small model holds — not merely more reasoning depth. **Astra is exempt from the Codex
ceiling** because it is the F tier and F needs a T4/T5 expression: `high` (default F), `xhigh`
(F T4), `max` (F T5, essentially never). Astra `low`/`medium` are priced like a strong X tier but
are not a substitute for Sol on X work.

### Thinking strategy per model (non-incumbent)

Defaults below are starting policies, not proven optima for any consuming project. They apply only
when the model and its control are exposed by the active runtime. None of them replaces a critical
reviewer on benchmark score alone. Unknown data retention or endpoint eligibility blocks sending
sensitive material there.

| Model | Tier (band) | Economical start | Raise thinking / switch condition |
| --- | --- | --- | --- |
| Grok 4.7 | — (unrated) | `high` is the cheapest measured configuration | Evaluate low/medium locally; `xhigh` gives the same displayed score at greater cost. Price long prompts separately |
| Grok 4.6 | S (44) | `medium` — the cheapest measured effort that reaches the S band | `low` (35) falls below the band; `xhigh` shows no gain over `high`; prefer 4.7 when justified by evidence, not by version number |
| Muse Spark 1.3 | X (48) | `xhigh` is the lower-cost of the two measured points | `max` buys ~3 displayed points for ~17% more; use only when those capabilities matter |
| Gemini 3.8 Flash | S (41) | `medium` when the task fits | `high` buys 1 displayed point for ~33% more. Multimodal/latency needs may justify it. `low` has a score but no published cost |
| MiMo V2.6 Pro (X, 46), GLM 5.3 Flash (S, 42), Qwen3.8 Max (X, 45), MiniMax M3 (W, 29), Step 5 (unpromoted) | from the single `default` point | verified provider default; no multi-effort curve established | Do not send invented effort enums. Measure supported variants locally first |
| GLM 5.3 (X, 45), Kimi K3 (S, 44), DeepSeek V4.1 Flash (S, 39) | from the single `max` point | only `max` has a complete measured score/cost pair | GLM 5.3 only `max` measured — that is not evidence to default to `max`. Confirm controls; evaluate lower settings on noncritical checkable work first |

An effort label from a benchmark table is not automatically a valid API parameter, and a per-agent
effort field in an IDE is not the same capability as the API's thinking budget controls. Where a
model publishes a sparser curve than the thinking level asks for, the router substitutes that model's
cheapest published setting at or above the request and labels the substitution — it never invents an
enum, and it never silently drops to a shallower one.

### Candidate alternatives and admission

The ten alternatives above are **in the matrix**, not in a footnote: `models/top-models.json` now
carries 20 fully routable entries — ten ladder incumbents (`admission: "incumbent"`) and ten measured
candidates (`admission: "candidate"`). A candidate's `tier` is not a ladder seat; it is a placement
from `tier_bands`, read off the best measured Artificial Analysis score:

| Band | Score | Candidates placed there |
| --- | --- | --- |
| W | ≤ 37 | MiniMax M3 (29) |
| S | 38–44 | DeepSeek V4.1 Flash (39), Gemini 3.8 Flash (41), GLM 5.3 Flash (42), Kimi K3 (44), Grok 4.6 (44) |
| X | 45–50 | Qwen3.8 Max (45), GLM 5.3 (45), MiMo V2.6 Pro (46), Muse Spark 1.3 (48) |
| F | ≥ 51 | none measured |

The bands are calibrated on the incumbents' measured range (Luna tops W at 37; Terra 38–42; the X
seats sit 45–50; Astra and Fable 5.1 cover 51 up). They place candidates only. **An incumbent's tier
is its seat on its own provider ladder and is never re-derived from a score** — which is why Opus 5
`max` (51) and Fable 5 `max` (50) sit outside their own band without moving tier.

Admission rules, enforced in `lib/router.mjs`, not merely advised:

1. A candidate is ranked **only** when the caller passes `--include-candidates` (`includeCandidates:
   true`), **or** when a runtime inventory marks that model `exposed` or `verified`. An exposed
   candidate is admitted for **noncritical lanes only**.
2. A candidate is **never** eligible for an independent-review seat, a **T4/T5** pair, or a
   risk-floor **review** row. It is returned with `excluded_reason: "candidate: not admitted for
   critical review"` — visible, so nobody concludes it was merely too expensive. The CLI tightens
   this one notch further: when a dispatch carries an independent-review requirement at all (money,
   auth, migrations, concurrency), the **implementation** seat closes to candidates too — an
   unvetted model does not write the change a second reviewer exists to catch.
3. Held candidates still appear in `explain()`, under a separate **"Candidates (not admitted by
   default)"** block with the flag needed. A ranking that hides its alternatives cannot be audited.
4. Ranking is by measured `$/task` where a measurement exists, and by the token-basket `price_index`
   where it does not. Each row carries `thinking_cost_index` (100 = Sol `medium` at $0.50/task) and
   the `marginal_thinking` step into that effort (`delta_score`, `cost_multiplier`) — the price of
   one more notch of thinking, so depth can be bought or refused on evidence.
5. `--cheapest-thinking` (`cheapestThinkingFor(pair, { maxScoreLoss })`) answers the thinking-cost
   question directly: the lowest-cost (model, effort) within `maxScoreLoss` (default 2) displayed
   points of the incumbent config for that pair. On `W T3` that is Luna `xhigh`; on `S T3` it is
   Terra `high`, and GLM 5.3 Flash `default` only when candidates are included.

None of this overrides a risk floor, a retention constraint or reviewer independence. A candidate
that is cheaper *and* higher-scoring than the incumbent still does not get a money, auth, migration
or concurrency review seat, because score is not reliability and none of these models has verified
data-retention or endpoint-eligibility terms. Never send secrets, PII, production tokens or
credential-bearing code to one.

## Tier × thinking resolution table

Concrete pairs used throughout the matrices below. "S T3" always means the Claude and Codex cells of
this row.

| Pair | Claude | Claude $ in/out | Codex | Codex $ in/out |
| --- | --- | --- | --- | --- |
| W T0–T1 | Haiku, thinking off | $1 / $5 | Luna `low` | $0.20 / $1.20 |
| W T2 | Haiku, small budget | $1 / $5 | Luna `medium` | $0.20 / $1.20 |
| W T3 | — (escalate to S; no headroom) | — | Luna `xhigh` (default) / `max` | $0.20 / $1.20 (~$0.06 / $0.10 per task) |
| S T1 | Sonnet `low` | $2 / $10 | Terra `low` | $2 / $12 |
| S T2 | Sonnet `medium` | $2 / $10 | Terra `medium` | $2 / $12 |
| S T3 | Sonnet `high` | $2 / $10 | Terra `high` | $2 / $12 |
| X T2 | Opus `medium` | $5 / $25 | Sol `medium` | $4 / $20 |
| X T3 | Opus `high` | $5 / $25 | Sol `high` | $4 / $20 |
| X T4 | Opus `xhigh` | $5 / $25 | Sol `high` + independent Sol `high` reviewer | 2x ($4 / $20) |
| F T3 | Fable 5 `high` | $10 / $50 | Astra `high` | $10 / $50 (~$1.41/task) |
| F T4 | Fable 5 `xhigh` | $10 / $50 | Astra `xhigh` | $10 / $50 (~$1.85/task) |
| F T5 | Fable 5 `max` (essentially never); Fable 5.1 only under the ≤2% cap | $10 / $50 | Astra `max` (essentially never) | $10 / $50 (~$2.57/task) |

Prices per MTok; thinking level does not change the unit price, but higher levels emit more
(billed-as-output) thinking tokens — same rate, more tokens.

## Default routing

- mechanical/scoped → W T0–T1
- standard implementation → S T2
- complex implementation → S T3
- planning default → S T3; hard planning → X T3–T4; frontier planning only → F T3–T4
- difficult debug/review → X T3
- security/payments/concurrency/migrations/critical compatibility → X T4
- frontier/long-horizon/cross-system/very ambiguous → F T3–T4
- F T5 = last escalation, never a default

## Escalation ladder

```
Claude: Haiku → Sonnet low → Sonnet medium → Sonnet high → Opus high → Opus xhigh → Fable 5 high → Fable 5 xhigh/max → Fable 5.1 (≤2% cap, explicit only)
Codex:  Luna low → Luna medium → Luna xhigh → Luna max → Terra medium → Terra high → Sol medium → Sol high → Sol high + independent Sol high reviewer → Astra high → Astra xhigh → Astra max (essentially never)
```

Escalate incrementally — never jump from S medium to F max. Raise **thinking** first when the
problem needs deeper reasoning; raise the **model** when the problem needs capacity, judgment,
autonomy, context or consistency beyond the current tier. Measured on routine tasks: medium ==
high output quality at 3.5x speed — but do not treat "mid model + high thinking" as universally equal
to a bigger model; they are not perfectly substitutable.

Before escalating after a failure, first remove redundant context, duplicate evidence passes and
unnecessary dispatches, and fix missing evidence, tool access or environment — those are not
reasoning failures and no amount of thinking repairs them. Budget **one** targeted escalation after
a failed attempt, preserve the diff and rerun the failed acceptance check; at a second relevant
failure, narrow scope or move to a higher-capacity model rather than traversing every intermediate
setting. Never use a retry policy to lower a required implementation or review floor.

**Refusal loop**: a weaker subagent may explicitly refuse a task as beyond its capability →
re-dispatch one tier up, keeping the thinking level. Never ask it to improvise an unsafe solution.

**T4/T5 on Codex**: on the gpt-5.6 family there is no usable effort above `high`, so X T4 stays
*Sol high + an independent Sol high reviewer* (different agent, no shared history) — that pairing is
a risk-floor rule, not a capability workaround, and Astra does not replace it. T5 exists only as
Astra `max` and is essentially never correct; narrow the task instead.

**F on Codex**: dispatch Astra at `high` (default F), `xhigh` (F T4, hardest case), `max`
(essentially never) — one agent, exactly like Fable 5 on Claude. The old decomposition workaround is
**obsolete as an F substitute**. It survives only as what it always genuinely was: a way to make a
task *smaller*. If Astra `xhigh` stalls on an F T4 problem, the answer is still to narrow and
decompose — with Astra as synthesizer, never by forking full history into one agent.

## Two scores, not one difficulty

Classify each dispatch on separate axes, not a single "difficulty":

```
MODEL CAPACITY = max(complexity, ambiguity, scope, novelty, cross_system, context_size)
THINKING       = max(reasoning_depth, ambiguity, debugging_uncertainty, risk)
REVIEW FLOOR   = risk
```

`context_size` is a floor, not a difficulty signal: a working set near or over a small model's window
rules that model out regardless of how mechanical the task is — shard it or run it S at T0–T1.

Worked example: "recolor 300 components" = complexity 3, risk 1 → W/S. "Change one condition in the
refund-eligibility function" = complexity 1, risk 5 → S implementation + X T4 independent review.
**Route by risk, not by LOC.** Client-compatibility, store/billing integrations and payment state are
far riskier than a UI component of the same size.

## Risk floors (review, not implementation)

For high-blast-radius work, impose a minimum **review** model even when implementation was cheap. A
cheap model implementing plus a strong model reviewing beats running the whole task on the expensive
model. The reviewer must be an independent agent — a separate child with no full-history fork.

The **area** column is the registry key: these rows are `registries/routing-matrix.json` →
`risk_floors`, one row per key, same names, same floors. A project binding adds rows or raises
floors; it never renames an area.

| Area | Implementation floor | Review floor | Independent review | Reading |
| --- | --- | --- | --- | --- |
| `text` | S T1 | S T2 | no | copy and strings |
| `i18n` | S T1 | S T2 | no | catalogs, locale keys |
| `ui-cosmetic` | W T0–T1 | S T1 | no | spacing, colour, non-semantic markup |
| `ui-component` | S T2 | S T3 | no | a component with behavior |
| `api-crud` | S T2 | S T3 | no | ordinary create/read/update/delete |
| `business-logic` | S T3 | X T3 | yes | rules with invariants |
| `sql` | S T2 | S T3 | no | queries, not schema |
| `schema-migration` | S T3 | X T4 | yes | any schema change + provenance |
| `realtime` | S T3 | X T3 | yes | broadcasting, presence, sockets |
| `client-compatibility` | X T3 | X T4 | yes | shipped or frozen clients |
| `auth` | S T3 | X T4 | yes | sessions, tokens, nonces |
| `security` | S T3 | X T4 | yes | signatures, secrets, permissions |
| `payments` | S T3 | X T4 | yes | card and gateway paths |
| `in-app-purchase` | X T3 | X T4 | yes | store purchase flows |
| `store-billing` | X T3 | X T4 | yes | store catalogs, prices, receipts |
| `refund` | X T3 | X T4 | yes | reversal and revocation |
| `entitlement` | X T3 | X T4 | yes | what the user is owed |
| `concurrency` | X T3 | X T4 | yes | locks, transactions, stale claims |
| `major-architecture` | X T4 | F T3 | yes | structural change across subsystems |
| `cross-system-redesign` | F T3 | F T4 | yes | several systems redesigned at once |
| `test-boilerplate` | W T0–T1 | — | no | scaffolding with no invariant of its own |

Concrete models per pair come from the **Tier × thinking resolution table** above: `X T4` is Opus
`xhigh` on Claude and Sol `high` + an independent second Sol `high` reviewer on Codex, and so on for
every row. Risk raises the **review** floor; it does not raise the implementation tier beyond the
row's own implementation floor.

**Project risk-floor rows in the consuming project's `## Orchestration bindings (project)` section
override these upward, never downward.**

## Agent defaults

| Agent role | Pair | Claude | Codex |
| --- | --- | --- | --- |
| explore, route-data-flow-tracer, production-telemetry-collector | W T0–T1 | Haiku, thinking off | Luna `low` |
| test-engineer, code-simplifier, backend-fixer (standard), frontend-fixer (standard), code-reviewer (default), general | S T2 | Sonnet `medium` | Terra `medium` |
| db-migration-author, adversarial-skeptic, frontend-specialist | S T3 | Sonnet `high` | Terra `high` |
| db-concurrency-specialist | X T3 | Opus `high` | Sol `high` |
| provider-webhook-specialist | X T2 (T3 on broken signatures/idempotency) | Opus `medium`/`high` | Sol `medium`/`high` |
| orchestrator / planning | S T3 default; X T3–T4 when complex; F only frontier | Sonnet high; Opus high/xhigh; Fable high | Terra high; Sol high for high-risk cross-system work; Astra high for frontier planning |

## Flow matrix (task segments)

| Flow | Segment | Pair | Claude | Codex |
| --- | --- | --- | --- | --- |
| INVESTIGATION | evidence collection (tracer, telemetry, explore) | W T0–T1 | Haiku | Luna low |
| | evidence synthesis | S T2; X T3 if complex | Sonnet medium; Opus high | Terra medium; Sol high |
| | adversarial-skeptic | S T3 | Sonnet high | Terra high |
| FEATURE | plan / design | S T3; X T3–T4 complex; F T4 frontier | Sonnet high; Opus high/xhigh; Fable xhigh | Terra high; Sol high (+2nd Sol at T4); Astra xhigh |
| | TDD (test-engineer) | S T2 | Sonnet medium | Terra medium |
| | standard implementation (API CRUD / UI components) | S T2 | Sonnet medium | Terra medium |
| | money/security implementation | X T3 | Opus high | Sol high |
| | mechanical subtasks | W T0–T1 | Haiku | Luna low |
| | review | S T3; risk floors override upward | Sonnet high | Terra high |
| | re-review (verify fixes landed) | S T1 | Sonnet low | Terra low |
| BUG_FIX | reproduce / evidence | W/S T0–T1 | Haiku/Sonnet low | Luna low/Terra low |
| | hypothesis (logic) | S T3 | Sonnet high | Terra high |
| | hypothesis money/concurrency/security | X T3–T4 | Opus high/xhigh | Sol high (+2nd Sol at T4) |
| | standard fix | S T2 | Sonnet medium | Terra medium |
| | money/concurrency/security fix | X T3 | Opus high | Sol high |
| | regression test | S T2 | Sonnet medium | Terra medium |
| REFACTOR | analysis + incremental plan | S T2 | Sonnet medium | Terra medium |
| | mechanical steps (moves, scoped extractions) | W T0 | Haiku | Luna low |
| | refactor in money areas | S T3 impl + X T4 review | Sonnet high → Opus xhigh | Terra high → Sol high + 2nd Sol high |
| DEPLOY | pre-checks, smoke | W T0 | Haiku | Luna low |
| | soak / telemetry interpretation | S T2 | Sonnet medium | Terra medium |
| CONFIG | standard config change | S T2 | Sonnet medium | Terra medium |
| | DB migration (migration + provenance) | S T3 | Sonnet high | Terra high |
| | migration on money tables | S T3 impl + X T4 review | Sonnet high → Opus xhigh | Terra high → Sol high + 2nd Sol high |
| REVIEW | default review | S T2–T3 | Sonnet medium/high | Terra medium/high |
| | money/security diff review | X T4 | Opus xhigh | Sol high + 2nd Sol high |
| RESEARCH | source collection | W T0–T1 | Haiku | Luna low |
| | synthesis + corroboration | S T2–T3 | Sonnet medium/high | Terra medium/high |
| INCIDENT | evidence | 4x W/S T1–T2 + S log specialist + S DB/runtime specialist | Haiku/Sonnet + Sonnet + Sonnet | Luna/Terra + Terra + Terra |
| | synthesis | X T3; F T3 only if X finds no solid hypothesis | Opus high; Fable high | Sol high; Astra high |

## Multi-agent orchestration

Never use premium models for mechanical evidence collection — a senior model as a grep agent is pure
waste. Invariant formula:

**W collects → S builds → X decides/reviews → F resolves the exceptional.**

For complex investigations: multiple W/S evidence agents → X synthesis → F only if the problem stays
ambiguous. For complex features: X/F planning → S builders → W mechanical subtasks → X review. The
planning model must not execute all subtasks itself. F appearing **once** in a whole flow (as planner
or synthesizer) is usually enough.

On Codex, when supplying a model override to `spawn_agent`, use `fork_turns="none"` or a bounded
recent-turn count, never a full-history fork. Independent reviewers and synthesizers must not share
the implementer's history — on any harness.

## Task shape moves the ranking — technology does not (measurably)

A model can be stronger on one kind of work and weaker on another. The benchmark evidence **proves
this for task shape** and **says nothing about technology**. Keep the two apart: rank the same models
across raw-pass coding, strict end-to-end completion, terminal/agentic loops and document reasoning
and they reorder by several places. A model that is last at finishing a code change end-to-end can be
second at shell/agentic loops and document reasoning — which makes it the value pick for deploys,
CI, container work and log spelunking, and a poor pick for "land this refactor green".

Nothing in that evidence separates CSS from JavaScript, one backend language from another, or one
datastore from another. **Do not invent per-technology routing rules from it.** Unverified stays
labelled unverified.

**Route by verifiability instead — that is the real per-technology axis.**

| Work | Model can self-verify? | Consequence |
|---|---|---|
| Application logic with a test runner | Yes | Model tier actually moves the outcome. Route by tier |
| SQL / migrations | Only if it runs the query | Tier matters less than forcing the real database loop + provenance check. A cheap model with the loop beats an expensive one without it |
| CSS / visual | **No** — not without a screenshot | Tier is nearly irrelevant. Route to browser automation and design skills, not to a bigger model. This is the most common over-escalation |
| Cache / concurrency | No — interleavings are invisible | Not a fluency problem; it is reasoning about schedules. The risk floor applies; tier does not substitute for it |

Corollary: **before escalating a tier on a CSS or visual task, add a screenshot instead.** It is free
relative to the tier jump and it fixes the actual gap.

If per-technology routing is wanted, measure it locally: take 10 closed tasks per stack, replay each
at a few frontier configs, record first-pass-green and $/task, and write the table from those
numbers. Until that exists, the per-technology map is empty and honestly so.

## F — only when it pays for itself

- Multi-system planning with entangled subsystems, hard debugging where X stalled, long-horizon
  autonomous refactors, genuinely frontier ambiguity. Default `high`; `xhigh` only for the hardest
  case; `max` essentially never.
- **Which F**: provider-flexible F work goes to the cheapest measured frontier config (Astra `high`)
  — same measured score as Fable 5 `max` at a quarter the cost per task. Choose Fable 5 instead when
  the flow is single-provider Claude, when the working set is large enough that long-context
  repricing is a risk, or when the task touches anything the other model's unverified retention
  terms make unwise. Choose Fable 5.1 only under its cap.
- **F is no longer the expensive tier, so the F band is wider — 10–15% of dispatches.** The old
  1–5% cap existed because F cost 4–5x X; that premium is gone on the cheap frontier config, so
  refusing to escalate no longer saves money — it just buys a worse answer.
- **But the band belongs to cheap F only.** 10–15% is the budget for the cheap frontier config. The
  expensive ones stay rare. Widening the *tier* share must not widen the *expensive-config* share.
- **The guardrail is $/task, not the tier label.** Cheap F invites over-escalation; what stops it is
  the flow's mean cost per task. F for a rename is still waste, just waste that hides better.
- **Fable 5.1 cap**: never a default at any tier; only on explicit user request or after a
  documented Fable 5 F-T4 failure. If it exceeds 2% of dispatches in a flow, the routing is wrong.
- **Retention caveat**: frontier models with mandatory 30-day retention (no zero-data-retention
  unless expressly authorized) never receive secrets, PII, production tokens or credential-bearing
  code. Safety classifiers may return a refusal stop reason — enable server-side fallbacks so the
  request reroutes automatically; a decline before any output is not billed. Single hard turns can
  run many minutes: stream, and plan timeouts and progress UX.

## Dispatch metadata

**Selection runs per shard, at dispatch time, against the live inventory — never once per task.**
Every dispatch is a PlanShard, and every PlanShard carries exactly this `routing` block (the same
thirteen names used in [dispatch](dispatch.md), [protocol.md](../protocol.md) and
`schemas/capability-contract.schema.json` — no synonyms):

| Field | Meaning |
| --- | --- |
| `pair` | The resolved tier × thinking pair, e.g. `S T3` |
| `tier` | `W` / `S` / `X` / `F` |
| `thinking_level` | `T0`…`T5` |
| `model_requested` | What the resolution row names for this pair on this ladder |
| `effort_requested` | The effort that row names |
| `model_effective` | What the runtime actually accepted; `null` when the shard is blocked |
| `effort_effective` | The effort the runtime actually accepted |
| `review_floor` | The minimum review pair this shard's risk imposes, or `null` |
| `independent_review` | Whether a separate reviewer with no forked history is required |
| `selection_reason` | Why this pair and this model — never "complex task" |
| `inventory_revision` | Which inventory reading the choice was made against |
| `price_source` | Dated provenance of the `$/task` figure |
| `est_usd_per_task` | Measured cost for the effective config, or `null` when unmeasured |

A runtime substitution that violates a floor invalidates that phase. Never silently fall back: an
inventory that exposes nothing eligible for the tier yields `blocked: "no eligible model"`, never a
quieter tier. When the inventory changes mid-flow, re-run selection for the **remaining** shards only.

Recorded alongside the block, in `flow:{task_id}` rather than inside it: `harness`, `provider`,
`role`, `risk`, `reason_for_tier`, `price_as_of`, `benchmark_version`, `inventory_source`,
`inventory_observed_at`, `availability`, `quota_state`, `window_state` and the acceptance outcome
(`registries/routing-matrix.json` → `dispatch_metadata_fields`). On Codex the thinking level maps to
`reasoning_effort`.

Choosing X/F, T4/T5, a legacy fallback or any override requires an explicit reason — e.g.
`provider=claude, model=opus, thinking=T4, risk=high, review_floor=X T4, reason="entitlement state +
backwards compatibility"`. Generic justifications like "complex task" are not acceptable. Never claim
the active parent model changed unless the harness confirms it.

## Cost discipline

Optimize the total cost of the solution, not one call. A W run that causes three reworks costs more
than S done right the first time; F for a rename is waste.

**The primary metric is mean $/task across the flow, not the tier histogram.** Tier shares are a
sanity check on classification. A healthy flow lands around **$0.40–0.70 mean $/task**: mostly the W
model for collection and mechanical work, the X model for the bulk of building and reviewing, and the
cheap frontier config on the genuinely hard 10–15%. Above ~$1.00 the router is escalating work a
cheaper tier would have solved; below ~$0.25 mechanical models are probably being run on tasks that
need judgment, and the reworks are hiding in the wall-clock.

Target distribution, per provider: **W 30–40%** of dispatches, **S 40–50%**, **X 5–12%**, **F
10–15%**. If 30%+ of tasks land on F, classification is too aggressive; 50% X is waste and strictly
dominated.

**Cost-effective routing, in one line:** climb the frontier, never step onto a dominated config, and
stop at the first one that solves the task reliably. Risk-floor rows override this — they buy
independence and care, not score.

Target: **minimum reliable model × minimum sufficient thinking × independent review proportional to
risk.**

## Quota windows — spend the budget, do not merely minimise it

The section above optimises **price per solution**. This one optimises **availability**, and the two
disagree exactly when a window is nearly spent. Providers meter in rolling windows, not one pool: a
short window (hours), a weekly window, and the billing month. A flow that ignores them either stalls
mid-task with a review unbought, or finishes a window with most of it unspent — and unspent headroom
on an expiring window bought nothing.

**Read before you spend.** Any flow that will dispatch more than a handful of agents starts by
reading current consumption from the harness's usage view and writing the reading, with the window it
belongs to, into the flow's ledger. Where usage is not exposed, record it as unknown — never invent a
percentage. Routing decisions made blind to the window are guesses.

**Budget the flow, not the call.** Before a multi-task flow, estimate dispatches × tier against
remaining headroom in the *tightest* window, usually the weekly one on multi-day work. If the flow
does not fit, decide what changes **now**, while every option is still open.

**The degradation ladder.** When a window is tight, give things up in this order:

| Order | Give up | Why it is cheap |
| --- | --- | --- |
| 1 | Parallel breadth on evidence gathering — serialise the fan-out | Costs wall-clock, not correctness |
| 2 | One thinking notch on dispatches that are **not** on a risk-floor row | Measured: medium ≈ high output quality on routine work |
| 3 | Full re-review → scoped re-review over the fix range only | Verifies the fix without re-reading the task |
| 4 | Implementation model tier where the plan carries literal code | Transcription does not need judgment |
| 5 | Batch same-shape tasks into one dispatch and review the batch as a unit | One context build instead of N |

**Never give up, at any consumption level:** the independent-review seat on a risk-floor row, or the
review model on money, security, concurrency, migrations or client compatibility. A miss there costs
more than an entire window. **Cut the implementer, never the reviewer.**

**Defer beats degrade.** If the only way to fit the remaining work into this window is to cut a
risk-floor review, stop and wait for the window to roll. Tell the human partner what you are waiting
for and when it resets.

**Watch the burn rate inside a task, not just across the flow.** Long fix loops are the largest
consumer — a task that reaches fix round 3 typically spends about as much again on rounds 4–5. Decide
at round 3 whether to fund the rest or park the task. Escalating to a stronger implementer at round 4
is usually *cheaper* than three more rounds of the same model failing the same way.

**Schedule against the window's shape.** Front-load risk-floor reviews while headroom is certain.
Leave mechanical W-tier work for the tail: it degrades gracefully, resumes cleanly, and is the only
work safe to run when a window is nearly gone.

**Record it.** When quota influenced a routing decision, add `window_state` to that dispatch's
metadata alongside `reason_for_tier` — otherwise the next reader cannot tell a considered downgrade
from sloppy routing.
