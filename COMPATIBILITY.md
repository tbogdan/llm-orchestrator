<!-- llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving -->
# Compatibility evidence — 2026-09-22

Supported installer adapters: Codex, Claude / Claude Code, OpenCode and Kilo. `claude-code` and `claude code` normalize to `claude` in installation, rendering and tool discovery. Support describes generated native artifacts and tested lifecycle behavior, not an end-to-end model execution guarantee.

- Codex: shared `.agents/skills` core and project bridge; natural task bootstrap plus skill intent routing. Existing personal task prompts can delegate to that bridge. CLI 0.153.4 detected; fresh-session skill loading has not been tested through model inference.
- Claude Code: `.claude/commands` aliases and managed `CLAUDE.md` import of AGENTS. Core belongs in an enabled `.claude/skills` root or a supported skill-folder symlink. CLI 2.1.275 detected. Native commands and documented loading layout checked; no paid inference smoke.
- OpenCode: `.opencode/commands` with argument placeholders; core in an enabled personal skill root. Version 2.0.10 detected. Adapter/lifecycle tests pass; live task execution remains unverified.
- Kilo: `.kilo/commands`; existing singular directory aliases may remain for compatible versions. Extension-bundled CLI 7.4.17 detected the installed `orchestrate-core` through `debug skill --pure` with isolated XDG directories. This proves discovery, not task execution. The existing host configuration has unrelated unsupported `web_search` and `reasoning_display` keys; it was not changed.

The consuming project receives only selected command adapters, the common bridge and one managed AGENTS reference. No provider permissions or account settings change. Non-Codex installs now default `--skills-root` per harness (`claude` → `~/.claude/skills`, `opencode` → `~/.config/opencode/skills`, `kilo` → `~/.kilo/skills`) instead of requiring it; a multi-harness install without an explicit root falls back to the shared `~/.agents/skills`, and a shared root must still be enabled in each chosen harness — installer output records native discovery as unverified rather than assuming it. `install --link-claude` can create the Claude personal skill-folder symlink itself.

Validation: 176 package tests (`node --test tests/*.test.mjs tests/models/*.test.mjs`), generated model-matrix freshness, frozen-client compatibility, static redaction, SQL placeholder checks and diff whitespace checks. Installer coverage includes all four adapters, aliases, idempotency, edited-file conflicts, exact text restoration, cross-project runtime ownership, canonical locks and removal of obsolete unchanged runtime files.

**Install + first run, proven end-to-end (`tests/e2e-install.test.mjs`, `tests/cli.test.mjs`).** For each of the four harnesses, a real `node bin/llm-orchestrator.mjs` subprocess (temp `HOME`, `XDG_STATE_HOME`, state root and skills root — nothing touches the real machine) is driven through the full lifecycle and every claim below is an assertion, not a description:
- `install` (dry run, then `--apply`) produces the expected generated files, each carrying the attribution marker, and the skill root receives the full core (`SKILL.md`, `policies/*.md`, `registries/*.json`), not just the bridge.
- A second `install --apply` is a true no-op: zero changes, zero conflicts.
- `doctor` exits 0 and reports the mandatory capability list.
- `init` exits 0 and reports missing mandatory tools without failing, proposes a harness from detected project/home config, and (with `--apply`) appends the `AGENTS.md` bindings template only when the section is absent.
- `uninstall --apply` removes only installer-owned, unchanged files and leaves the user's own `AGENTS.md` text intact minus the managed span.
- A realistic fixture project (`fixtures/discovery/web-monorepo`, no pre-existing `AGENTS.md`) installs cleanly, and a `--with-agents` run renders the per-harness orchestrator agent file.

This proves the generated-files-and-lifecycle contract from both a fresh checkout of this repo and a copy of a consuming project's tree; it does not exercise live model inference or a harness's actual skill-discovery reload (that step is manual and documented in the Troubleshooting section of the README).

Independent reviews found permission-normalization and installer lifecycle defects; those were fixed with regression tests. No publication or production deployment performed.

Official format references: [Claude Code skills](https://code.claude.com/docs/en/skills), [OpenCode skills](https://opencode.ai/docs/skills), [OpenCode commands](https://opencode.ai/docs/commands), [Kilo skills](https://kilo.ai/docs/customize/skills), [Kilo command-directory discovery](https://github.com/Kilo-Org/kilocode/blob/main/packages/opencode/src/kilocode/skills/kilo-config.md). Runtime permissions and installed-version behavior still take precedence over catalog assumptions.
