<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# Asking the User — native, batched, once

Asking is rare and it is expensive. When it is nevertheless required, the question goes through the
**harness's native question mechanism**, batched into **one** question, at the moment the answer is
needed — never as free text at the end of a message, and never as "awaiting confirmation".

## When asking is allowed

These are exactly the exceptions already named in [execution](execution.md) rule 3. Nothing else
qualifies:

| # | Case | Source of the obligation |
|---|---|---|
| 1 | **Mandatory-tool gap** — a mandatory core or project item is not installed: state the gap, recommend the install once, ask install / continue degraded / abort | [SKILL.md](../SKILL.md) portability rule, [capabilities](capabilities.md) |
| 2 | **Batched minor findings** — every review finding marked "minor", "concern" or "out of scope": **"skip or fix?"**, with a one-line cost each | [verification](verification.md), minor-findings rule |
| 3 | **Destructive or irreversible action** — data deletion, production state change, publishing, store submission, remote branch deletion, cleanup of unmerged work | [execution](execution.md) rule 3(b), [cleanup](cleanup.md) |
| 4 | **Genuine scope ambiguity** — and only after all four steps of "Tool Usage — Always Before Asking" in [execution](execution.md) have failed: codebase/docs search, memory search, conversation history, reasonable assumption from context | [execution](execution.md) |

Everything else on the Violations list in [execution](execution.md) stays forbidden. A technical
choice you can make yourself is not a question.

## The batching rule

**One question object per decision point, one call, all questions inside it.** Collect every open
question the current phase produced, ask them together, then continue. Dribbling one question per
message is a violation of the same rule that forbids ending on a question, because it converts one
interruption into five.

- Open questions accumulate in `open_questions[]` in the pre-evaluation object
  ([protocol.md](../protocol.md)) and in `task:{task_id}`.
- A question that a search, a memory drawer or the code can answer is removed from the batch before
  asking, not asked "to be safe".
- Ask at the **decision point**, not at the end of the work: a destructive action is confirmed
  immediately before it, not retroactively.

## Required structure

Every question carries, in the harness's native fields:

| Part | Requirement |
|---|---|
| **Title** | Short, names the decision — not "Question 1" |
| **Question** | One sentence, answerable without reading the whole transcript |
| **Options** | 2–4 concrete options, each with a **one-line cost** (what it buys, what it gives up) |
| **Default / recommended** | Exactly one option marked as the recommendation, with its reason |
| **Free-text escape** | Allowed where the harness offers it; never the only path |

**No answer is not approval.** An unanswered question resolves to `blocked_pending_user` for the
capability, phase or finding it gates. Independent work continues; the gated phase does not start.
Never proceed as if the recommended option had been chosen, and never report a gated phase as
`not_applicable` because the answer never arrived.

## Harness mechanisms

| Harness | Native mechanism | Notes |
|---|---|---|
| Claude Code | `AskUserQuestion` tool | Multiple questions in one call; options carry `label` + `description`. Use one call for the whole batch |
| Codex | `request_user_input` when the collaboration tooling exposes it | Otherwise: a final plan step via `update_plan` **plus** a single explicit question in the same turn |
| OpenCode | `question` tool when present | Otherwise one single-message question containing the whole batch |
| Kilo | `ask_followup_question` | Native, with `<suggest>` options — one suggestion per option, recommendation first |

Resolve the mechanism the same way every other harness difference is resolved: from the **Harness
compatibility** table in [protocol.md](../protocol.md). Never assume another harness's tool name, and
never launch a second harness to obtain a question mechanism. Where none of the above is available,
the fallback is **one** explicit single-message question with the same structure — a fallback, never
the default.

## Subagents never ask the user

A dispatched child has no user. It returns `question_for_user` in its handoff — same structure
(title, question, options with costs, recommendation) — and stops at the gated step with
`blocked_pending_user`. The **orchestrator** merges every child's `question_for_user` into the single
batched question it asks. A child that ends its handoff with a free-text question to the user has
violated this policy, and the orchestrator asks properly on its behalf rather than relaying the text.
