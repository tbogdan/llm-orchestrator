<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# BUG_FIX — reproduce and repair a defect

**Flow**: Reproduce → Evidence → Hypothesis → Regression → Fix → Review.
**Triggers**: "fix", "repair", "broken", a failing behavior report.

## Mandatory

- **`systematic-debugging`** — loaded before proposing any fix.
- **Reproduce before fixing.** A fix proposed from a reading of the code, without an observed
  reproduction, does not pass G1.
- Exactly one falsifiable hypothesis at G2, recorded in `hypothesis:{task_id}`.
- A regression test that is **observed RED** before the fix, then GREEN after.

## Optional (trigger)

- route-data-flow-tracer — the symptom crosses layers.
- db-concurrency-specialist — an interleaving is suspected.
- Browser automation (`playwright`) — the symptom is UI-visible.

## Available

Compact investigator scout (locate only), read-only exploration agent.

## Roles and routing by phase

| Phase | Roles | Pair |
|---|---|---|
| Reproduce / evidence | explore, route-data-flow-tracer, production-telemetry-collector | W/S T0–T1 |
| Hypothesis (logic) | synthesizer | S T3 |
| Hypothesis (money, concurrency, security) | db-concurrency-specialist, provider-webhook-specialist | X T3–T4 |
| Regression test | test-engineer | S T2 |
| Standard fix | backend-fixer / frontend-fixer | S T2 |
| Money / concurrency / security fix | domain specialist | X T3 |
| Review | code-reviewer (independent) | S T3; risk floors override upward |

Evidence collection runs once per chain and is reused; re-investigation only after a write lands on
covered files or a concrete named gap appears.

## Gates

Canonical gate names come from [protocol.md](../protocol.md); the detail after each dash is what
that gate means in this flow.

- **G0** Plan Approved — flow, ownership and reproduction scope defined
- **G1** Evidence / Requirements Complete — reproduction plus evidence artifacts written
- **G2** Hypothesis / Design Valid — a single falsifiable hypothesis
- **G3** Test RED — the regression test observed failing
- **G4** Build GREEN — fresh GREEN after the fix
- **G5** Review PASS — independent review after integration
- **G6** Verification Complete — smoke on the affected surface

## Notes

Unknown access or an environment failure is not a model reasoning failure — fix the gap or report it;
do not escalate the tier to compensate. A test that fails in the area you touched is your work: fix
it in the same session. Resolve required and optional capabilities per phase via
[capabilities](../policies/capabilities.md); a missing mandatory item is declared first, recommended
once, and only after explicit refusal carried as a `degraded:` line.
