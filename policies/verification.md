<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# Verification

Evidence before assertions, always. `verification-before-completion` runs before any completion
claim.

## Gate evidence rules

- **G3** Test RED — the failing test must have been *observed* failing for the exact failure or
  requirement. A test that was written but never run does not satisfy G3.
- **G4** Build GREEN — requires **fresh** GREEN evidence collected locally: tests pass, lint clean,
  build succeeds, with exit status recorded. **A builder's report never substitutes for local diff
  and test evidence.**
- **G5** Review PASS — a **read-only review after integration**, by an independent agent that did not
  inherit the implementer's conversation history. No ownership conflicts, hypothesis or requirements
  addressed, full suite GREEN.
- **G6** Verification Complete — domain smoke checks for the affected surfaces, run for real, with
  their output recorded in `verification:{task_id}`.

Select checks from the project instructions, the task acceptance criteria and the changed behavior.
Run real checks, inspect exit status, and report skipped or unverified separately from passed. Use
full suites when the project contract requires them; otherwise meaningful scoped checks suffice.
Expand testing for new changes or unresolved failures, not as ritual repetition.

For executable features and bugs, establish a failing behavioral check before the fix, then GREEN.
Refactors preserve behavior and coverage. Documentation, configuration and instruction changes take
relevant consistency, schema or scenario checks rather than artificial implementation-mirroring
tests, and mark G3 `not_applicable` with that reason.

Distinguish infrastructure failure from code failure and from reasoning failure. A mocked or
provider-local check cannot establish live lifecycle behavior; say so rather than implying it did.

## Source-reading tests

Tests that read the source rather than behavior break on a legitimate extraction with nothing
actually broken. **Move the assertion to the new authority and add one that verifies the
delegation**, so the original invariant stays guarded. Never delete or weaken an assertion to reach
green.

## Minor findings, concerns and out-of-scope calls

- A review finding marked "minor" or "concern" is **NEVER** silently skipped or parked. Ask the user
  explicitly: **"skip or fix?"** — with a one-line cost of each option.
- Anything that looks out of scope for the current task gets explicit user confirmation before being
  treated as out of scope. "Parked with a ruling" without the user's yes is not allowed.
- These questions are **batched** (one list, one native question call), not dribbled one at a time,
  and they use the harness's native question mechanism — see [questions](questions.md).
- This rule takes precedence over the "never end with a question" rule in
  [execution](execution.md) — it is one of that rule's four exceptions.

## Zero-tolerance for warnings

Any warning, deprecation notice, info-level complaint, or error encountered **ANYWHERE** gets fixed,
not stepped over: terminal and tool output, language-runtime deprecations, container logs, browser
console, test runners, build output, linters — any context. If it cannot be fixed in the current
task, it goes on the ledger or todo list explicitly, with an owner, never silently ignored.

**Deprecations are bugs, not warnings.** A deprecation printed by code you wrote *or merely ran past*
is a defect in the file it points at, and it gets fixed in the same change. Today's deprecation is
the next release's fatal error, and a runtime split across versions can already make it hard on one
process while it is a notice on another. Verify against the interpreter or runtime that production
uses, not the one your shell defaults to.

## Independent review

Independent review is required whenever a risk floor in [routing](routing.md) — core or
project-tightened — says so. **It is never cut, at any quota level: cut the implementer, never the
reviewer.** The absence of an independent reviewer leaves that acceptance **unverified**; self-review
is not a substitute and must never be described as independent.

Record concrete findings and resolve scoped defects. Do not change unrelated user work. Report actual
evidence rather than claiming completion from the fact that a tool was invoked.
