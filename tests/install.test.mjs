import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, symlink, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { applyInstallation, planInstallation, planUninstall, uninstallInstallation } from '../lib/installation.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'portable-orchestrator-'));
  const source = join(root, 'source');
  const project = join(root, 'project');
  const stateRoot = join(root, 'state');
  const skillsRoot = join(root, 'skills');
  await Promise.all([
    mkdir(join(source, 'policies'), {recursive: true}),
    mkdir(join(source, 'lib'), {recursive: true}),
    mkdir(join(source, 'bin'), {recursive: true}),
    mkdir(join(source, 'tests'), {recursive: true}),
    mkdir(join(source, 'docs'), {recursive: true}),
    mkdir(join(source, 'fixtures'), {recursive: true}),
    mkdir(join(source, 'private'), {recursive: true}),
    mkdir(project, {recursive: true}),
  ]);
  await Promise.all([
    writeFile(join(source, 'SKILL.md'), '# Core\n'),
    writeFile(join(source, 'protocol.md'), '# Protocol\n'),
    writeFile(join(source, 'policies', 'routing.md'), '# Routing\n'),
    writeFile(join(source, 'lib', 'runner.mjs'), 'export {};\n'),
    writeFile(join(source, 'lib', '.env'), 'secret\n'),
    writeFile(join(source, 'lib', 'notes.txt'), 'ignored\n'),
    writeFile(join(source, 'bin', 'doctor.mjs'), 'export {};\n'),
    writeFile(join(source, 'tests', 'ignored.mjs'), 'ignored\n'),
    writeFile(join(source, 'docs', 'ignored.md'), 'ignored\n'),
    writeFile(join(source, 'fixtures', 'ignored.txt'), 'ignored\n'),
    writeFile(join(source, 'private', 'ignored.txt'), 'ignored\n'),
    writeFile(join(source, 'IMPLEMENTATION.md'), 'ignored\n'),
    writeFile(join(source, '.gitignore'), 'ignored\n'),
  ]);
  return {root, source, project, stateRoot, skillsRoot};
}

function options(fx, extra = {}) {
  return {project: fx.project, harnesses: ['codex'], packageRoot: fx.source, stateRoot: fx.stateRoot, skillsRoot: fx.skillsRoot, ...extra};
}

test('dry run is a plan only and apply creates an external runtime with one bootstrap', async () => {
  const fx = await fixture();
  const dryRun = await planInstallation(options(fx));
  assert.equal(dryRun.conflicts.length, 0);
  assert.ok(dryRun.files.some(({scope, path}) => scope === 'skills' && path === 'SKILL.md'));
  await assert.rejects(readFile(join(fx.project, 'AGENTS.md')));

  const first = await applyInstallation(options(fx));
  assert.equal(first.conflicts.length, 0);
  assert.equal(first.genericAgentsReferences, 1);
  assert.equal(first.manifest.skill_resolution.native_discovery, 'unverified');
  assert.equal(first.manifest.skill_resolution.skills_root_source, 'operator_provided');
  assert.match(await readFile(join(fx.project, 'AGENTS.md'), 'utf8'), /orchestration entrypoint/);
  await readFile(join(fx.skillsRoot, 'orchestrate-core', 'SKILL.md'));
  await assert.rejects(readFile(join(fx.skillsRoot, 'orchestrate-core', 'tests', 'ignored.mjs')));
  await assert.rejects(readFile(join(fx.skillsRoot, 'orchestrate-core', 'docs', 'ignored.md')));
  await assert.rejects(readFile(join(fx.skillsRoot, 'orchestrate-core', 'IMPLEMENTATION.md')));
  await assert.rejects(readFile(join(fx.skillsRoot, 'orchestrate-core', '.gitignore')));
  await assert.rejects(readFile(join(fx.skillsRoot, 'orchestrate-core', 'lib', '.env')));
  await assert.rejects(readFile(join(fx.skillsRoot, 'orchestrate-core', 'lib', 'notes.txt')));
  assert.equal(first.manifest.project_id.includes(fx.project), false);
  await readFile(first.manifestPath);
});

test('second install is idempotent and never overwrites a user owned bridge', async () => {
  const fx = await fixture();
  await applyInstallation(options(fx));
  const second = await applyInstallation(options(fx));
  assert.deepEqual(second.changes, []);

  const other = await fixture();
  await mkdir(join(other.project, '.agents', 'skills', 'orchestrate'), {recursive: true});
  await writeFile(join(other.project, '.agents', 'skills', 'orchestrate', 'SKILL.md'), '# User skill\n');
  const plan = await planInstallation(options(other));
  assert.ok(plan.conflicts.includes('.agents/skills/orchestrate/SKILL.md'));
});

test('updates an unchanged installer-owned generated bridge when its rendered content changes', async () => {
  const fx = await fixture();
  const first = await applyInstallation(options(fx));
  const bridge = join(fx.project, '.agents', 'skills', 'orchestrate', 'SKILL.md');
  const oldContent = '# Previous installer bridge\n';
  await writeFile(bridge, oldContent);
  const stored = JSON.parse(await readFile(first.manifestPath, 'utf8'));
  stored.files.find(({path}) => path === '.agents/skills/orchestrate/SKILL.md').hash = createHash('sha256').update(oldContent).digest('hex');
  await writeFile(first.manifestPath, `${JSON.stringify(stored)}\n`);
  const updated = await applyInstallation(options(fx));
  assert.deepEqual(updated.conflicts, []);
  assert.ok(updated.changes.some(({path, action}) => path === '.agents/skills/orchestrate/SKILL.md' && action === 'update'));
});

test('updates an unchanged installer-owned AGENTS span while preserving surrounding user text', async () => {
  const fx = await fixture();
  const first = await applyInstallation(options(fx));
  const oldSpan = '<!-- orchestrate-core:agents:begin -->\nOld bootstrap\n<!-- orchestrate-core:agents:end -->';
  await writeFile(join(fx.project, 'AGENTS.md'), `# Application\n\n${oldSpan}\n\n# Parent text\n`);
  const stored = JSON.parse(await readFile(first.manifestPath, 'utf8'));
  stored.spans.find(({path}) => path === 'AGENTS.md').hash = createHash('sha256').update(oldSpan).digest('hex');
  await writeFile(first.manifestPath, `${JSON.stringify(stored)}\n`);
  const updated = await applyInstallation(options(fx));
  assert.deepEqual(updated.conflicts, []);
  const agents = await readFile(join(fx.project, 'AGENTS.md'), 'utf8');
  assert.match(agents, /orchestration entrypoint/);
  assert.match(agents, /# Application[\s\S]*# Parent text/);
});

test('uninstall removes unchanged owned files but preserves user edits', async () => {
  const fx = await fixture();
  await applyInstallation(options(fx, {harnesses: ['claude']}));
  const bridge = join(fx.project, '.agents', 'skills', 'orchestrate', 'SKILL.md');
  await writeFile(bridge, '# User changed this bridge\n');
  const result = await uninstallInstallation(options(fx, {harnesses: ['claude']}));
  assert.ok(result.preserved.includes('.agents/skills/orchestrate/SKILL.md'));
  assert.equal(await readFile(bridge, 'utf8'), '# User changed this bridge\n');
  await assert.rejects(readFile(join(fx.project, 'AGENTS.md')));
});

test('refuses traversal and symlink targets without touching them', async () => {
  const fx = await fixture();
  await mkdir(join(fx.project, '.agents', 'skills'), {recursive: true});
  await symlink(join(fx.root, 'outside'), join(fx.project, '.agents', 'skills', 'orchestrate'));
  const plan = await planInstallation(options(fx));
  assert.ok(plan.conflicts.some((conflict) => conflict.includes('.agents/skills/orchestrate')));
  await assert.rejects(planInstallation({...options(fx), project: `${fx.project}/../../`}), /traversal/i);
});

test('existing AGENTS text is preserved and only the exact managed span is removed', async () => {
  const fx = await fixture();
  await writeFile(join(fx.project, 'AGENTS.md'), '# Application contract\n');
  await applyInstallation(options(fx));
  const installedManifest = JSON.parse(await readFile((await planInstallation(options(fx))).manifestPath, 'utf8'));
  assert.equal(installedManifest.spans.find(({path}) => path === 'AGENTS.md').before, '\n');
  assert.equal(installedManifest.spans.find(({path}) => path === 'AGENTS.md').after, '\n');
  await writeFile(join(fx.project, 'AGENTS.md'), `${await readFile(join(fx.project, 'AGENTS.md'), 'utf8')}\n# Parent migration\n`);
  const result = await uninstallInstallation(options(fx));
  assert.deepEqual(result.conflicts, []);
  assert.equal(await readFile(join(fx.project, 'AGENTS.md'), 'utf8'), '# Application contract\n\n# Parent migration\n');
});

test('multi-harness installation owns one shared bridge and one AGENTS span', async () => {
  const fx = await fixture();
  const result = await applyInstallation(options(fx, {harnesses: ['claude', 'opencode']}));
  assert.equal(result.manifest.spans.filter(({path}) => path === 'AGENTS.md').length, 1);
  assert.equal(result.manifest.files.filter(({path}) => path === '.agents/skills/orchestrate/SKILL.md').length, 1);
  const additive = await applyInstallation(options(fx, {harnesses: ['codex']}));
  assert.deepEqual(additive.manifest.harnesses, ['claude', 'opencode', 'codex']);
});

test('uninstall restores exact surrounding AGENTS bytes including absent trailing newline', async () => {
  const fx = await fixture();
  const original = '# Application contract';
  await writeFile(join(fx.project, 'AGENTS.md'), original);
  await applyInstallation(options(fx));
  await uninstallInstallation(options(fx));
  assert.equal(await readFile(join(fx.project, 'AGENTS.md'), 'utf8'), original);
});

test('uninstall leaves the shared external core for another project', async () => {
  const fx = await fixture();
  const secondProject = join(fx.root, 'second-project');
  await mkdir(secondProject);
  await applyInstallation(options(fx));
  await applyInstallation({...options(fx), project: secondProject});
  await uninstallInstallation(options(fx));
  await readFile(join(fx.skillsRoot, 'orchestrate-core', 'SKILL.md'));
  await readFile(join(secondProject, '.agents', 'skills', 'orchestrate', 'SKILL.md'));
});

test('a later install safely upgrades the retained global core after project detach', async () => {
  const fx = await fixture();
  await applyInstallation(options(fx));
  await uninstallInstallation(options(fx));
  await writeFile(join(fx.source, 'SKILL.md'), '# Core v2\n');
  const upgraded = await applyInstallation(options(fx));
  assert.deepEqual(upgraded.conflicts, []);
  assert.ok(upgraded.changes.some(({scope, path, action}) => scope === 'skills' && path === 'SKILL.md' && action === 'update'));
  assert.equal(await readFile(join(fx.skillsRoot, 'orchestrate-core', 'SKILL.md'), 'utf8'), '# Core v2\n');
});

test('uninstall dry run reports the owned project changes without removing them', async () => {
  const fx = await fixture();
  await applyInstallation(options(fx));
  const plan = await planUninstall(options(fx));
  assert.ok(plan.changes.some(({path}) => path === '.agents/skills/orchestrate/SKILL.md'));
  assert.ok(plan.retained_shared_runtime.includes('SKILL.md'));
  await readFile(join(fx.project, '.agents', 'skills', 'orchestrate', 'SKILL.md'));

  // Dry run and apply used to spell this field differently (retained_runtime vs
  // retained_shared_runtime), so a caller reading the documented name got
  // undefined from one of them. Both paths must agree with the README.
  const applied = await uninstallInstallation(options(fx));
  assert.ok(Array.isArray(applied.retained_shared_runtime), 'uninstall --apply must return retained_shared_runtime');
  assert.ok(!('retained_runtime' in applied) && !('retained_runtime' in plan), 'the old spelling must not come back');
});

test('upgrades remove unchanged obsolete runtime files and preserve edited files', async () => {
  const fx = await fixture();
  await applyInstallation(options(fx));
  await unlink(join(fx.source, 'policies', 'routing.md'));
  const next = await applyInstallation(options(fx));
  assert.equal(next.conflicts.length, 0);
  await assert.rejects(readFile(join(fx.skillsRoot, 'orchestrate-core', 'policies', 'routing.md')));
  assert.ok(!next.runtimeManifest.files.some(file => file.path === 'policies/routing.md'));
  await writeFile(join(fx.skillsRoot, 'orchestrate-core', 'protocol.md'), 'user edits');
  await unlink(join(fx.source, 'protocol.md'));
  const conflict = await applyInstallation(options(fx));
  assert.ok(conflict.conflicts.includes('skills/orchestrate-core/protocol.md'));
  assert.equal(await readFile(join(fx.skillsRoot, 'orchestrate-core', 'protocol.md'), 'utf8'), 'user edits');
});

test('canonical aliases cannot bypass an existing installation lock', async () => {
  const fx = await fixture();
  const plan = await applyInstallation(options(fx));
  const alias = `${fx.root}-alias`;
  await symlink(fx.root, alias);
  await writeFile(`${plan.runtimeManifestPath}.lock`, 'held');
  await assert.rejects(applyInstallation(options(fx, {project: join(alias, 'project'), stateRoot: join(alias, 'state'), skillsRoot: join(alias, 'skills')})), /Installation is locked/);
});

test('--with-agents installs one agent file per role and --codex-prompts-root installs Codex prompts outside the project', async () => {
  const fx = await fixture();
  const codexPromptsRoot = join(fx.root, 'codex-prompts');
  const applied = await applyInstallation(options(fx, {withAgents: true, codexPromptsRoot}));
  assert.equal(applied.conflicts.length, 0);

  const orchestratorAgent = await readFile(join(fx.project, '.agents', 'agents', 'orchestrator.md'), 'utf8');
  assert.match(orchestratorAgent, /^---\nname: orchestrator\n/);

  const orchestratePrompt = await readFile(join(codexPromptsRoot, 'orchestrate.md'), 'utf8');
  assert.match(orchestratePrompt, /^---\ndescription: /);
  await assert.rejects(readFile(join(fx.project, 'orchestrate.md')));

  const promptFile = applied.manifest.files.find((file) => file.scope === 'prompts' && file.path === 'orchestrate.md');
  assert.ok(promptFile, 'expected the manifest to track the prompts-scope file');

  const reapplied = await applyInstallation(options(fx, {withAgents: true, codexPromptsRoot}));
  assert.equal(reapplied.conflicts.length, 0);
  assert.deepEqual(reapplied.changes, []);
});

test('a differing pre-existing Codex prompt file is reported as a conflict, not overwritten', async () => {
  const fx = await fixture();
  const codexPromptsRoot = join(fx.root, 'codex-prompts');
  await mkdir(codexPromptsRoot, {recursive: true});
  await writeFile(join(codexPromptsRoot, 'orchestrate.md'), 'user-authored prompt');
  const plan = await planInstallation(options(fx, {codexPromptsRoot}));
  assert.ok(plan.conflicts.some((conflict) => conflict.includes('orchestrate.md')));
});
