<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# DEPLOY — perform an authorized release

**Flow**: Pre-checks → Deploy → Smoke → Soak.
**Triggers**: "deploy", "release", "ship", "publish".

## Mandatory

- **Explicit target and release authorization.** Deployment permission is never inferred from a
  completed build or a passing test run.
- **Client-compatibility check** for any already-shipped client that must keep working against the
  new backend (routes, response shapes, message keys).
- **Migrations applied** and their provenance/rollback state verified before the release proceeds.
- **Smoke checks** after the release, run for real, with output recorded.
- **Telemetry collection on the soak** — a release is not closed on the deploy command's exit status.

## Optional (trigger)

- Native-build MCP — a mobile or desktop native build is part of the release.
- CI/build MCP — an edge or worker deployment is involved.
- Platform-config MCP — a third-party app configuration was touched.

## Available

Performance profiling skills, infrastructure API MCPs.

## Roles and routing by phase

| Phase | Roles | Pair |
|---|---|---|
| Pre-checks, compatibility, migration readiness | verifier, db-migration-author | W T0 collection; S T3 for migration readiness |
| Deploy execution | verifier under explicit authorization | W T0 (discovered project command) |
| Smoke | verifier | W T0 |
| Soak / telemetry interpretation | production-telemetry-collector | W T0 collection, S T2 interpretation |

Use the **discovered project deployment commands** from the project bindings section; this package
bundles none.

## Gates

Canonical gate names come from [protocol.md](../protocol.md); the detail after each dash is what
that gate means in this flow.

- **G0** Plan Approved — authorization and target recorded
- **G1** Evidence / Requirements Complete — pre-checks complete: compatibility, migrations, rollback path
- **G2** Hypothesis / Design Valid — release plan valid
- **G3** Test RED — `not_applicable` with that reason — a deploy does not fabricate a RED test
- **G4** Build GREEN — build/release artifacts verified
- **G5** Review PASS — review of the release diff where risk requires
- **G6** Verification Complete — smoke plus soak evidence

## Notes

A failed compatibility or migration check blocks the release; it is not a warning to step over. If a
rollback path does not exist, say so before deploying, not after. Resolve required and optional
capabilities per phase via [capabilities](../policies/capabilities.md); a missing mandatory item is
declared first, recommended once, and only after explicit refusal carried as a `degraded:` line.
