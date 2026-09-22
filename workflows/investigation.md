<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# INVESTIGATION — explain without unauthorized mutation

**Flow**: Evidence → Synthesis → Challenge → Report.
**Triggers**: "why", "analyze", "how does", "debug", "is it true that".

## Mandatory

- **Adversarial challenge of the synthesis — never ship a single-source conclusion.** The skeptic is
  a separate agent that did not produce the synthesis.
- All agents run `RO` (`edit: deny`, no provider writes). An investigation does not implement its own
  proposed fix.
- Every collector writes an evidence artifact with `file:line` refs, open questions and the source
  revision. The artifact, not the agent's context, is the durable output.
- **`exa` whenever any part of the explanation rests on external or current facts** — vendor or
  library behavior local docs and `context7` do not cover, versions, prices, API changes, or the
  same symptom seen in the wild. Such a claim made from training data alone does not pass G2. If
  `exa` is not installed: state the gap first, recommend installation once, and only after an
  explicit refusal continue in declared degraded mode with a `degraded: exa` line and those claims
  labelled unverified.

## Optional (trigger)

- Semantic-code MCP — symbol-level questions across a large codebase.
- Memory recall **before fanning out** — the answer may already be filed.

## Available

Read-only exploration agent, general-purpose agent, compact investigator scouts.

## Roles and routing by phase

| Phase | Roles | Pair |
|---|---|---|
| Evidence collection | route-data-flow-tracer, production-telemetry-collector, explore | W T0–T1 |
| Evidence synthesis | synthesizer | S T2; X T3 if complex |
| Adversarial challenge | adversarial-skeptic | S T3 |

Fan-out follows the independent questions, with the minimums from
[dispatch](../policies/dispatch.md): 2 MODERATE, 3 COMPLEX, 4 CRITICAL where independent scopes
exist. Collectors run in parallel with disjoint scopes; synthesis is sequential.

## Gates

Canonical gate names come from [protocol.md](../protocol.md); the detail after each dash is what
that gate means in this flow.

- **G0** Plan Approved — questions and scopes defined
- **G1** Evidence / Requirements Complete — evidence artifacts complete
- **G2** Hypothesis / Design Valid — supported explanation, challenged
- **G3** Test RED — `not_applicable` with that reason — an investigation does not fabricate a RED test
- **G4** Build GREEN — `not_applicable` with that reason; no code is built
- **G5** Review PASS — skeptic verdict recorded
- **G6** Verification Complete — report states confidence and concrete gaps

## Notes

Reuse fresh evidence; a second read-only pass over the same scope with no write in between is a
protocol violation. Report confidence and named gaps rather than a confident single narrative, and
distinguish what was observed from what was inferred. Resolve required and optional capabilities per
phase via [capabilities](../policies/capabilities.md); a missing mandatory item is declared first,
recommended once, and only after explicit refusal carried as a `degraded:` line.
