// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cli = join(repoRoot, 'bin', 'llm-orchestrator.mjs');
const ATTRIBUTION = 'llm-orchestrator · created by Bogdan-Gabriel Torcescu';

const HARNESSES = ['codex', 'claude', 'opencode', 'kilo'];

async function tempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

function run(args, { cwd = repoRoot, env } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

async function makeHarness(prefix) {
  const root = await tempDir(prefix);
  const project = join(root, 'project');
  const home = join(root, 'home');
  const stateRoot = join(root, 'state');
  const skillsRoot = join(root, 'skills');
  const codexPromptsRoot = join(root, 'codex-prompts');
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  await writeFile(join(project, 'AGENTS.md'), '# Test project\n\nSome project-specific text.\n');
  const env = { HOME: home, XDG_STATE_HOME: join(root, 'xdg-state') };
  return { root, project, home, stateRoot, skillsRoot, codexPromptsRoot, env };
}

function baseArgs(fixture, harness) {
  return [
    '--project', fixture.project,
    '--harness', harness,
    '--state-root', fixture.stateRoot,
    '--skills-root', fixture.skillsRoot,
    ...(harness === 'codex' ? ['--codex-prompts-root', fixture.codexPromptsRoot] : []),
  ];
}

for (const harness of HARNESSES) {
  test(`install --apply, doctor, init, uninstall lifecycle for ${harness}`, async (t) => {
    const fixture = await makeHarness(`llm-orch-e2e-${harness}-`);
    t.after(() => rm(fixture.root, { recursive: true, force: true }));

    const dryRun = run(['install', ...baseArgs(fixture, harness)], { env: fixture.env });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const dryPlan = JSON.parse(dryRun.stdout);
    assert.equal(dryPlan.conflicts.length, 0);
    assert.ok(dryPlan.changes.length > 0);

    const apply = run(['install', ...baseArgs(fixture, harness), '--apply'], { env: fixture.env });
    assert.equal(apply.status, 0, apply.stderr);
    const applied = JSON.parse(apply.stdout);
    assert.equal(applied.conflicts.length, 0);

    // Generated files exist and carry the attribution marker.
    const agentsMd = await readFile(join(fixture.project, 'AGENTS.md'), 'utf8');
    assert.match(agentsMd, /orchestrate-core:agents:begin/);
    assert.match(agentsMd, /Some project-specific text\./);

    const bridgeSkill = await readFile(join(fixture.project, '.agents', 'skills', 'orchestrate', 'SKILL.md'), 'utf8');
    assert.ok(bridgeSkill.includes(ATTRIBUTION));

    if (harness === 'claude') {
      const claudeMd = await readFile(join(fixture.project, 'CLAUDE.md'), 'utf8');
      assert.match(claudeMd, /orchestrate-core:claude-import:begin/);
      const command = await readFile(join(fixture.project, '.claude', 'commands', 'task.md'), 'utf8');
      assert.ok(command.includes(ATTRIBUTION));
    }
    if (harness === 'opencode') {
      const command = await readFile(join(fixture.project, '.opencode', 'commands', 'task.md'), 'utf8');
      assert.ok(command.includes(ATTRIBUTION));
    }
    if (harness === 'kilo') {
      const command = await readFile(join(fixture.project, '.kilo', 'commands', 'task.md'), 'utf8');
      assert.ok(command.includes(ATTRIBUTION));
    }

    // The skill root carries the full core: SKILL.md + policies + registries.
    const runtimeRoot = join(fixture.skillsRoot, 'orchestrate-core');
    const coreSkill = await readFile(join(runtimeRoot, 'SKILL.md'), 'utf8');
    assert.ok(coreSkill.includes(ATTRIBUTION));
    const routingPolicy = await readFile(join(runtimeRoot, 'policies', 'routing.md'), 'utf8');
    assert.ok(routingPolicy.length > 0);
    const capabilitiesRegistry = await readFile(join(runtimeRoot, 'registries', 'capabilities.json'), 'utf8');
    assert.ok(JSON.parse(capabilitiesRegistry));

    // A second apply is a no-op: zero changes, zero conflicts.
    const secondApply = run(['install', ...baseArgs(fixture, harness), '--apply'], { env: fixture.env });
    assert.equal(secondApply.status, 0, secondApply.stderr);
    const secondPlan = JSON.parse(secondApply.stdout);
    assert.equal(secondPlan.conflicts.length, 0);
    assert.equal(secondPlan.changes.length, 0);

    // doctor runs read-only and exits 0 with the mandatory list.
    const doctor = run(['doctor', '--project', fixture.project, '--harness', harness], { env: fixture.env });
    assert.equal(doctor.status, 0, doctor.stderr);
    const doctorReport = JSON.parse(doctor.stdout);
    assert.ok(Array.isArray(doctorReport.capability_plan.mandatory));
    assert.ok(doctorReport.capability_plan.mandatory.length > 0);

    // init reports missing tools without failing.
    const init = run(['init', ...baseArgs(fixture, harness)], { env: fixture.env });
    assert.equal(init.status, 0, init.stderr);
    assert.match(init.stdout, /Mandatory core tools:/);

    // uninstall --apply removes only owned files and leaves the user's AGENTS.md text minus the span.
    const uninstall = run(['uninstall', ...baseArgs(fixture, harness), '--apply'], { env: fixture.env });
    assert.equal(uninstall.status, 0, uninstall.stderr);
    const uninstallResult = JSON.parse(uninstall.stdout);
    assert.equal(uninstallResult.conflicts.length, 0);

    const agentsMdAfter = await readFile(join(fixture.project, 'AGENTS.md'), 'utf8');
    assert.doesNotMatch(agentsMdAfter, /orchestrate-core:agents:begin/);
    assert.match(agentsMdAfter, /Some project-specific text\./);
  });
}

test('init proposes a harness from detected project config and does not fail on a fresh project', async (t) => {
  const fixture = await makeHarness('llm-orch-e2e-init-detect-');
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await mkdir(join(fixture.project, '.claude'), { recursive: true });

  const init = run(['init', '--project', fixture.project, '--state-root', fixture.stateRoot, '--skills-root', fixture.skillsRoot], { env: fixture.env });
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /Detected harness config: claude/);
  assert.match(init.stdout, /Proposed --harness: claude/);
});

test('init --apply writes the bindings template when AGENTS.md lacks the section', async (t) => {
  const fixture = await makeHarness('llm-orch-e2e-init-bindings-');
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const init = run(['init', ...baseArgs(fixture, 'codex'), '--apply'], { env: fixture.env });
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /just written/);

  const agentsMd = await readFile(join(fixture.project, 'AGENTS.md'), 'utf8');
  assert.match(agentsMd, /## Orchestration bindings \(project\)/);
});

test('install into a realistic project fixture (web-monorepo) succeeds', async (t) => {
  const fixture = await makeHarness('llm-orch-e2e-fixture-');
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await rm(fixture.project, { recursive: true, force: true });
  await cp(join(repoRoot, 'fixtures', 'discovery', 'web-monorepo'), fixture.project, { recursive: true });

  const apply = run(['install', ...baseArgs(fixture, 'codex'), '--apply'], { env: fixture.env });
  assert.equal(apply.status, 0, apply.stderr);
  const applied = JSON.parse(apply.stdout);
  assert.equal(applied.conflicts.length, 0);

  const agentsMd = await readFile(join(fixture.project, 'AGENTS.md'), 'utf8');
  assert.match(agentsMd, /orchestrate-core:agents:begin/);
  // The fixture's own files are untouched.
  const packageJson = await readFile(join(fixture.project, 'package.json'), 'utf8');
  assert.match(packageJson, /"workspace"/);
});

test('install --with-agents renders the per-harness orchestrator agent file', async (t) => {
  const fixture = await makeHarness('llm-orch-e2e-agents-');
  t.after(() => rm(fixture.root, { recursive: true, force: true }));

  const apply = run(['install', ...baseArgs(fixture, 'claude'), '--with-agents', '--apply'], { env: fixture.env });
  assert.equal(apply.status, 0, apply.stderr);
  const applied = JSON.parse(apply.stdout);
  assert.equal(applied.conflicts.length, 0);

  const agentFile = await readFile(join(fixture.project, '.claude', 'agents', 'orchestrator.md'), 'utf8');
  assert.ok(agentFile.includes(ATTRIBUTION));
});
