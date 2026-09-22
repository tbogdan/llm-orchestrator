<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# FEATURE — plan and implement a feature

**Flow**: Plan → TDD → Build → Test → Review → Verify.
**Triggers**: "build", "add", "create", "implement".

## Mandatory

- **Brainstorming before plan mode.** Explore intent, requirements and design before any
  implementation planning.
- **The test-engineer writes the failing test first.** No builder is dispatched before G3 RED.
- Discover project conventions and acceptance criteria before designing against them.
- Independent review wherever a risk floor applies.

## Optional (trigger)

- `context7` — any library or SDK API surface, **including familiar ones**; training data lags.
- Design-system + UI-styling skills — any new UI.
- Payment-provider best-practices skill — the change touches a money path.
- Semantic-code MCP — a large cross-file edit.

## Available

Code-architect role, code-explorer, spec-complete code generator (only when the spec is complete and
no clarification is needed).

## Roles and routing by phase

| Phase | Roles | Pair |
|---|---|---|
| Plan / design | orchestrator (plus `feature-dev-code-architect` where the harness has it) | S T3; X T3–T4 complex; F T4 frontier |
| TDD | test-engineer | S T2 |
| Standard implementation (API CRUD, UI components) | backend-fixer, frontend-fixer | S T2 |
| Complex state / realtime / native bridge | frontend-specialist | S T3 |
| Money or security implementation | backend-fixer under the domain floor | X T3 |
| Mechanical subtasks | worker roles | W T0–T1 |
| Review | code-reviewer (independent) | S T3; risk floors override upward |
| Re-review (verify fixes landed) | code-reviewer | S T1, scoped to the fix range |

The planning model must not execute all subtasks itself: X/F plans, S builds, W does mechanical work,
X reviews. Parallel builders require disjoint ownership.

## Gates

Canonical gate names come from [protocol.md](../protocol.md); the detail after each dash is what
that gate means in this flow.

- **G0** Plan Approved — flow built, design approved, ownership defined
- **G1** Evidence / Requirements Complete — requirements complete
- **G2** Hypothesis / Design Valid — design valid
- **G3** Test RED — the failing test observed failing before any builder is dispatched
- **G4** Build GREEN — fresh GREEN
- **G5** Review PASS — independent review after integration
- **G6** Verification Complete — acceptance verification on the affected surfaces

## Notes

Do not invoke incident or provider tooling without relevant evidence. Resolve required and optional
capabilities per phase via [capabilities](../policies/capabilities.md); a missing mandatory item is
declared first, recommended once, and only after explicit refusal carried as a `degraded:` line in
every plan, handoff and report.
