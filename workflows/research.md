<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# RESEARCH — gather and document evidence

**Flow**: Source → Extract → Corroborate → Document.
**Triggers**: "research", "compare", "find out", "what's the current", time-sensitive facts.

## Mandatory

- **`exa` (external research MCP) with the `search` skill — always, on every RESEARCH task.** A
  RESEARCH answer assembled from training data alone is invalid, not merely weaker. If `exa` is not
  installed, state the gap first, recommend installation once, and only after an explicit refusal
  continue in declared degraded mode with a `degraded: exa` line on every plan, handoff and report,
  and every affected claim labelled unverified.
- **Dated provenance for every time-sensitive claim**: source, URL or tool, and the date observed.
  An undated claim is not evidence.
- **Adversarial challenge before publishing a conclusion** — never ship a single-source conclusion.
- Compare like-for-like: do not mix benchmark versions, provider catalogs, or a public catalog with
  account-specific availability. Unverified stays labelled unverified; missing data is not zero.

## Optional (trigger)

- `context7` — library, SDK or API behavior (it answers "how does this API work"; `exa` answers
  "what is true right now" — they are not interchangeable).
- Documentation skills — the output is a document with a required structure.

## Available

Read-only exploration agent, general-purpose agent, link and consistency validators.

## Roles and routing by phase

| Phase | Roles | Pair |
|---|---|---|
| Source collection | research collectors (parallel, disjoint questions) | W T0–T1 |
| Extraction | collectors | W T0–T1 |
| Synthesis + corroboration | synthesizer | S T2–T3 |
| Challenge | adversarial-skeptic | S T3 |

Fan-out follows the independent questions, with the minimums from
[dispatch](../policies/dispatch.md). Each collector writes its own evidence artifact.

## Gates

Canonical gate names come from [protocol.md](../protocol.md); the detail after each dash is what
that gate means in this flow.

- **G0** Plan Approved — questions and scope defined
- **G1** Evidence / Requirements Complete — sources collected with dates
- **G2** Hypothesis / Design Valid — synthesis challenged
- **G3** Test RED — `not_applicable` with that reason — **no fabricated RED test for a documentation task**
- **G4** Build GREEN — `not_applicable` with that reason; nothing is built
- **G5** Review PASS — skeptic verdict recorded
- **G6** Verification Complete — link, schema and internal-consistency checks on the produced document

## Notes

Record uncertainty explicitly and separate observed facts from inference. Validate documentation
links and internal consistency before publishing. Never send credentials or private material to an
external search or documentation endpoint. Resolve required and optional capabilities per phase via
[capabilities](../policies/capabilities.md); a missing mandatory item is declared first, recommended
once, and only after explicit refusal carried as a `degraded:` line.
