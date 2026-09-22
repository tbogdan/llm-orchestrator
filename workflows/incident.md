<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# INCIDENT — resolve an operational incident

**Flow**: Evidence → Hypothesis → Fix → Verify → Close.
**Triggers**: production error, 5xx, stuck state, webhook failure, alert.

## Mandatory

- The phase commands run **in order**: `incident-start` → `incident-evidence` → `incident-fix` →
  `incident-verify` → `incident-close`. Skipping or reordering invalidates the incident.
- **Telemetry collection happens before any hypothesis.** A hypothesis formed before evidence is
  rejected at G2, whatever it claims.
- Respect incident authorization and the production read/write boundary. Only authorized remediation.
- Exactly one falsifiable hypothesis reaches G2. Record it in `hypothesis:{task_id}`.
- Close persists `runbook:{task_id}` (timeline, decisions, gaps) and `regression:{task_id}`.

## Optional (trigger)

- Edge/CDN observability MCP — the symptom is at the edge or in a worker.
- Native-platform debugger skill — a native crash is involved.
- Memory recall of a prior incident — the symptom rhymes with something already filed.

## Available

Incident orchestration workflow, adversarial-skeptic, read-only exploration agents.

## Roles and routing by phase

| Phase | Roles | Pair |
|---|---|---|
| Evidence | production-telemetry-collector ×N, route-data-flow-tracer, log specialist, DB/runtime specialist | 4× W/S T1–T2 + S log specialist + S DB/runtime specialist |
| Hypothesis / synthesis | synthesizer, adversarial-skeptic | X T3; F T3 only if X finds no solid hypothesis |
| Fix (standard) | backend-fixer / frontend-fixer | S T2 |
| Fix (money, concurrency, security) | db-concurrency-specialist, provider-webhook-specialist | X T3 |
| Regression test | test-engineer | S T2 |
| Review | code-reviewer (independent) | S T3; risk floors override upward |
| Verify / soak | production-telemetry-collector | W T0 collection, S T2 interpretation |

Evidence agents run in parallel with disjoint scopes; fan-out minimum is 4 for a CRITICAL incident.
Synthesis is sequential.

## Gates

Canonical gate names come from [protocol.md](../protocol.md); the detail after each dash is what
that gate means in this flow.

- **G0** Plan Approved — flow and ownership defined
- **G1** Evidence / Requirements Complete — evidence complete, artifacts written
- **G2** Hypothesis / Design Valid — a single falsifiable hypothesis
- **G3** Test RED — the regression test observed failing
- **G4** Build GREEN — fresh GREEN
- **G5** Review PASS — independent review after integration
- **G6** Verification Complete — domain smoke on the affected surfaces

## Notes

Preserve logs with redaction: no credentials, tokens or PII in drawers or reports. Use provider
tooling only for state actually relevant to the incident, and use its narrowest read-only operation
before any write. Resolve required and optional capabilities for each phase via
[capabilities](../policies/capabilities.md); a missing mandatory item is declared first, recommended
once, and only after explicit refusal carried as a `degraded:` line.
