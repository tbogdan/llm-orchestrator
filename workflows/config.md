<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# CONFIG — change configuration or schema deliberately

**Flow**: Plan → Change → Validate → Review.
**Triggers**: "configure", "migrate", "set up", "change the setting".

## Mandatory

- **The db-migration-author role writes any schema change — never hand-write a migration.**
- A migration is a **two-step** change: run it, then regenerate and update whatever provenance
  artifact the project keeps. The second step is not optional; without it the next release fails its
  schema check.
- Identify the exact version and effective configuration scope before editing. Configuration
  precedence differs per domain — never diagnose from one file alone.
- A rollback path is stated before the change is applied.

## Optional (trigger)

- provider-webhook-specialist — a payment or store webhook configuration is involved.
- Platform-config MCP — a third-party app configuration is touched.
- Provider SDK upgrade skill — an API or SDK version moves.
- `context7` — any documented configuration surface, including familiar ones.

## Available

Infrastructure API MCPs, harness config skill.

## Roles and routing by phase

| Phase | Roles | Pair |
|---|---|---|
| Plan | planner | S T2 |
| Standard config change | backend-fixer | S T2 |
| DB migration (migration + provenance) | db-migration-author | S T3 |
| Migration on money tables | db-migration-author | S T3 implementation + **X T4 review** |
| Validate | verifier | W/S T1 |
| Review | code-reviewer (independent) | S T3; risk floors override upward |

## Gates

Canonical gate names come from [protocol.md](../protocol.md); the detail after each dash is what
that gate means in this flow.

- **G0** Plan Approved — scope and rollback path recorded
- **G1** Evidence / Requirements Complete — current effective configuration read, not assumed
- **G2** Hypothesis / Design Valid — change design valid
- **G3** Test RED — schema/consistency check observed failing where applicable, otherwise `not_applicable` with that reason
- **G4** Build GREEN — migration applied, provenance updated, checks GREEN
- **G5** Review PASS — independent review; X T4 on money tables
- **G6** Verification Complete — smoke on the affected surface

## Notes

Do not import another harness's permission syntax and do not change global credentials. Validate
native schemas rather than assuming a shape. Resolve required and optional capabilities per phase via
[capabilities](../policies/capabilities.md); a missing mandatory item is declared first, recommended
once, and only after explicit refusal carried as a `degraded:` line.
