<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# REFACTOR — preserve behavior while restructuring

**Flow**: Analyze → Coverage → Incremental → Review.
**Triggers**: "refactor", "clean up", "extract", "simplify", "deduplicate".

## Mandatory

- **Coverage exists before the first edit.** If the area has no meaningful coverage, write it first;
  a refactor without a behavioral net does not pass G1.
- Identify behavior and compatibility invariants before touching anything. Externally visible
  contracts are preserved — no renamed error keys, no removed response fields, no moved routes.
- Small transformations with disjoint ownership, each verifiable on its own.

## Optional (trigger)

- `code-simplifier` — clarity and consistency cleanups on the changed code.
- Semantic-code MCP — symbol-level moves across many files.

## Available

Bounded ≤2-file builder, the `explore` role, traceability analysis where the project uses it.

## Roles and routing by phase

| Phase | Roles | Pair |
|---|---|---|
| Analysis + incremental plan | orchestrator, code-simplifier, explore | S T2 |
| Coverage | test-engineer | S T2 |
| Mechanical steps (moves, scoped extractions) | worker roles | W T0 |
| Refactor in money or security areas | domain specialist | S T3 implementation + X T4 review |
| Review | code-reviewer (independent) | S T3; risk floors override upward |

## Gates

Canonical gate names come from [protocol.md](../protocol.md); the detail after each dash is what
that gate means in this flow.

- **G0** Plan Approved — plan of small steps
- **G1** Evidence / Requirements Complete — invariants and existing coverage identified
- **G2** Hypothesis / Design Valid — transformation plan valid
- **G3** Test RED — `not_applicable` when coverage already exists, with that reason recorded; otherwise the new coverage is observed passing before the first edit
- **G4** Build GREEN — fresh GREEN after each step
- **G5** Review PASS — independent review
- **G6** Verification Complete — smoke on the affected surface

## Notes

**Source-reading tests broken by a legitimate extraction move their assertion to the new authority
and add one verifying the delegation.** Never delete or weaken an assertion to reach green — that is
the single most common way a refactor silently drops an invariant. Resolve required and optional
capabilities per phase via [capabilities](../policies/capabilities.md); a missing mandatory item is
declared first, recommended once, and only after explicit refusal carried as a `degraded:` line.
