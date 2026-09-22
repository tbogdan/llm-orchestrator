import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { discoverProject } from '../lib/project-discovery.mjs';
import { discoverTools } from '../lib/tool-discovery.mjs';

const fixtures = new URL('../fixtures/discovery/', import.meta.url);
const execFileAsync = promisify(execFile);

async function fixturePath(name) {
  return new URL(`${name}/`, fixtures).pathname;
}

async function fixtureHash(root) {
  const files = ['package.json', 'pyproject.toml', 'frontend/package.json', 'capacitor.config.ts'];
  const values = await Promise.all(files.map(async (file) => {
    try {
      return `${file}:${await readFile(join(root, file), 'utf8')}`;
    } catch {
      return '';
    }
  }));
  return createHash('sha256').update(values.join('\n')).digest('hex');
}

test('discovers no facts for an empty project without writing it', async () => {
  const root = await fixturePath('empty');
  const before = await fixtureHash(root);
  const profile = await discoverProject({ root });

  assert.deepEqual(profile.languages, []);
  assert.deepEqual(profile.frameworks, []);
  assert.deepEqual(profile.domains, []);
  assert.deepEqual(profile.commands, []);
  assert.ok(profile.facts.every((fact) => fact.evidence.length > 0));
  assert.equal(await fixtureHash(root), before);
});

test('derives Python service facts from bounded manifest evidence', async () => {
  const profile = await discoverProject({ root: await fixturePath('python-service') });

  assert.deepEqual(profile.languages, ['python']);
  assert.ok(profile.frameworks.includes('fastapi'));
  assert.ok(profile.domains.includes('web'));
  assert.ok(profile.commands.some((command) => command.command === 'python -m pytest'
    && command.cwd === '.' && command.package_manager === 'python'));
  assert.ok(profile.facts.some((fact) => fact.kind === 'framework' && fact.value === 'fastapi'
    && fact.evidence.includes('pyproject.toml')));
});

test('discovers Node web metadata and shallow workspace package metadata', async () => {
  const profile = await discoverProject({ root: await fixturePath('web-monorepo') });

  assert.ok(profile.languages.includes('typescript'));
  assert.ok(profile.frameworks.includes('vue'));
  assert.ok(profile.domains.includes('web'));
  assert.ok(profile.commands.some((command) => command.command === 'test'
    && command.cwd === 'packages/site' && command.package_manager === 'npm'));
  assert.ok(profile.facts.some((fact) => fact.evidence.includes('packages/site/package.json')));
});

test('recognizes mobile signals only when manifest evidence supports them', async () => {
  const profile = await discoverProject({ root: await fixturePath('mobile-app') });

  assert.ok(profile.frameworks.includes('capacitor'));
  assert.ok(profile.domains.includes('mobile'));
  assert.ok(profile.facts.some((fact) => fact.evidence.includes('capacitor.config.ts')));
  assert.equal(profile.schema_version, '1.0');
  assert.match(profile.observed_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('never asks injected reads for secrets or arbitrary config paths', async () => {
  const requested = [];
  const files = new Map([
    ['package.json', '{"name":"safe"}'],
    ['.env', 'TOP_SECRET=never-read'],
  ]);
  await discoverProject({
    root: '/fixture',
    listFiles: async () => [...files.keys()],
    readText: async (path) => {
      requested.push(path);
      return files.get(path) ?? null;
    },
  });

  assert.ok(requested.includes('package.json'));
  assert.ok(!requested.some((path) => path.includes('.env')));
});

test('does not follow an allowed manifest symlink outside the project root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portable-discovery-'));
  const outside = join(root, '..', `outside-${Date.now()}.json`);
  await writeFile(outside, '{"dependencies":{"vue":"1"}}');
  await symlink(outside, join(root, 'package.json'));

  try {
    const profile = await discoverProject({ root });
    assert.deepEqual(profile.languages, []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { force: true });
  }
});

test('ignores oversized manifests before parsing their package signals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portable-large-manifest-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({
    dependencies: { vue: '1' }, padding: 'x'.repeat(70 * 1024),
  }));
  try {
    const profile = await discoverProject({ root });
    assert.deepEqual(profile.languages, []);
    assert.ok(!profile.frameworks.includes('vue'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('discovers generic one-level frontend backend and realtime manifest evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portable-common-layout-'));
  await mkdir(join(root, 'frontend'));
  await mkdir(join(root, 'backend'));
  await mkdir(join(root, 'realtime'));
  await writeFile(join(root, 'package-lock.json'), '{}');
  await writeFile(join(root, 'frontend', 'package.json'), JSON.stringify({
    scripts: { test: 'vitest run' }, dependencies: { stripe: '1', firebase: '1' },
  }));
  await writeFile(join(root, 'backend', 'composer.json'), JSON.stringify({
    require: { 'stripe/stripe-php': '1' }, scripts: { test: 'phpunit' },
  }));
  await writeFile(join(root, 'realtime', 'package.json'), JSON.stringify({
    dependencies: { 'socket.io': '1' },
  }));
  try {
    const profile = await discoverProject({ root });
    assert.ok(profile.languages.includes('php'));
    assert.ok(profile.domains.includes('stripe'));
    assert.ok(profile.domains.includes('billing'));
    assert.ok(profile.domains.includes('firebase'));
    assert.ok(profile.domains.includes('realtime'));
    assert.ok(profile.commands.some((command) => command.command === 'test'
      && command.cwd === 'frontend' && command.package_manager === 'npm'));
    assert.ok(profile.commands.some((command) => command.command === 'test'
      && command.cwd === 'backend' && command.package_manager === 'composer'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('changes the fingerprint when bounded manifest content changes without changing inferred facts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portable-fingerprint-'));
  const manifest = join(root, 'package.json');
  await writeFile(manifest, JSON.stringify({ scripts: { test: 'one' } }));
  const first = await discoverProject({ root });
  await writeFile(manifest, JSON.stringify({ scripts: { test: 'two' } }));
  const second = await discoverProject({ root });
  try {
    assert.notEqual(first.fingerprint, second.fingerprint);
    assert.ok(second.commands.some((command) => command.command === 'test' && command.package_manager === 'unknown'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('keeps configured tools installed and preserves runtime permission denial', async () => {
  const inventory = await discoverTools({
    harness: 'codex',
    runtimeInventory: {
      session: 'session-a',
      entries: [
        {
          id: 'browser.inspect',
          kind: 'native_tool',
          capabilities: ['browser.inspect'],
          scope: 'harness',
          source: 'active runtime tool schema',
          status: 'callable',
          permission: 'read_only',
          evidence: ['runtime:browser.inspect'],
          limitations: [],
        },
        {
          id: 'stripe-admin',
          kind: 'mcp',
          capabilities: ['billing.inspect'],
          scope: 'harness',
          source: 'active runtime tool schema',
          status: 'callable',
          permission: 'denied',
          evidence: ['runtime:stripe-admin'],
          limitations: ['account access denied'],
        },
      ],
    },
    projectEntries: [{ id: 'configured-only', kind: 'mcp', capabilities: ['reasoning.checkpoints'] }],
    userEntries: [{ id: 'project-browser', aliases: ['browser.inspect'], kind: 'native_tool', capabilities: ['browser.inspect'] }],
  });

  assert.equal(inventory.entries.find((entry) => entry.id === 'configured-only').status, 'installed');
  assert.equal(inventory.entries.find((entry) => entry.id === 'stripe-admin').status, 'denied');
  assert.equal(inventory.entries.find((entry) => entry.id === 'browser.inspect').status, 'callable');
  assert.equal(inventory.entries.filter((entry) => entry.id === 'browser.inspect').length, 1);
  assert.match(inventory.revision, /^[a-f0-9]{16}$/);
});

test('demotes disk callable claims and does not add disk capabilities to a callable runtime tool', async () => {
  const inventory = await discoverTools({
    harness: 'codex',
    runtimeInventory: { entries: [{
      id: 'browser', aliases: ['inspect'], kind: 'native_tool', status: 'callable',
      capabilities: ['browser.inspect'], evidence: ['runtime-browser'],
    }] },
    projectEntries: [{
      id: 'local-browser', aliases: ['browser', 'inspect'], kind: 'native_tool', status: 'callable',
      capabilities: ['browser.mutate'], evidence: ['Bearer should-not-appear'],
    }],
  });
  const browser = inventory.entries.find((entry) => entry.id === 'browser');
  assert.equal(browser.status, 'callable');
  assert.deepEqual(browser.capabilities, ['browser.inspect']);
  assert.ok(!browser.evidence.some((value) => /bearer/i.test(value)));

  const diskOnly = await discoverTools({
    harness: 'codex', projectEntries: [{ id: 'disk-only', kind: 'mcp', status: 'callable', permission: 'read_write' }],
  });
  assert.equal(diskOnly.entries[0].status, 'installed');
  assert.equal(diskOnly.entries[0].permission, 'unknown');
});

test('collapses transitive aliases without collapsing distinct kinds', async () => {
  const inventory = await discoverTools({
    harness: 'codex',
    runtimeInventory: { entries: [
      { id: 'alpha', aliases: ['beta'], kind: 'mcp', status: 'loaded' },
      { id: 'gamma', aliases: ['alpha', 'beta'], kind: 'mcp', status: 'callable' },
      { id: 'alpha', kind: 'skill', status: 'loaded' },
    ] },
  });
  assert.equal(inventory.entries.filter((entry) => entry.kind === 'mcp').length, 1);
  assert.equal(inventory.entries.filter((entry) => entry.kind === 'skill').length, 1);
});

test('rejects credential-shaped identifiers and exposes bounded scan truncation', async () => {
  const inventory = await discoverTools({
    harness: 'codex',
    runtimeInventory: { entries: [{ id: 'ghp_fakecredential123', kind: 'mcp', status: 'callable' }] },
  });
  assert.equal(inventory.entries.length, 0);

  const profile = await discoverProject({
    root: '/fixture',
    listFiles: async () => ({ files: ['package.json'], truncated: true }),
    readText: async () => '{"scripts":{"test":"test"}}',
  });
  assert.equal(profile.coverage.truncated, true);
  assert.ok(profile.limitations.some((limitation) => limitation.includes('truncated')));
  assert.ok(profile.commands.some((command) => command.package_manager === 'unknown'));
});

test('does not infer callable tooling from disk metadata and retains unloaded MCPs', async () => {
  const inventory = await discoverTools({
    harness: 'claude',
    runtimeInventory: { entries: [{ id: 'sequentialthinking', kind: 'mcp', status: 'installed' }] },
    projectEntries: [{ id: 'local-workflow', kind: 'workflow', source: 'project metadata' }],
    userEntries: [],
  });

  assert.equal(inventory.entries.find((entry) => entry.id === 'sequentialthinking').status, 'installed');
  assert.equal(inventory.entries.find((entry) => entry.id === 'local-workflow').status, 'installed');
  assert.equal(inventory.entries.find((entry) => entry.id === 'local-workflow').permission, 'unknown');
});

test('doctor is read-only and reports only supplied active inventory plus bounded project metadata', async () => {
  const root = await fixturePath('web-monorepo');
  const before = await fixtureHash(root);
  const inventoryFile = join(await mkdtemp(join(tmpdir(), 'portable-inventory-')), 'inventory.json');
  await writeFile(inventoryFile, JSON.stringify({
    entries: [{ id: 'active-browser', kind: 'native_tool', status: 'callable', capabilities: ['browser.inspect'] }],
  }));

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      'bin/doctor.mjs', '--project', root, '--harness', 'codex', '--inventory', inventoryFile,
      '--confirm-runtime-inventory',
      '--task', 'feature', '--phase', 'plan', '--role', 'planner', '--signals', 'web-ui', '--requires-shell', '--nontrivial',
    ], { cwd: new URL('..', import.meta.url).pathname });
    const report = JSON.parse(stdout);
    assert.equal(report.project.root, root.replace(/\/$/, ''));
    assert.equal(report.inventory.harness, 'codex');
    assert.equal(report.inventory.entries.find((entry) => entry.id === 'active-browser').status, 'callable');
    assert.equal(report.inventory.schema_version, '1.0');
    assert.match(report.inventory.observed_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Array.isArray(report.capability_plan.required));
    assert.ok(report.capability_plan.recommendations.some((item) => item.capability === 'workflow.plan'));
    assert.equal(await fixtureHash(root), before);
  } finally {
    await rm(inventoryFile, { force: true });
  }
});

test('doctor treats supplied inventory as unverified unless explicitly confirmed', async () => {
  const root = await fixturePath('empty');
  const inventoryFile = join(await mkdtemp(join(tmpdir(), 'portable-unverified-inventory-')), 'inventory.json');
  await writeFile(inventoryFile, JSON.stringify({ entries: [{ id: 'browser', kind: 'native_tool', status: 'callable', capabilities: ['browser.inspect'] }] }));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      'bin/doctor.mjs', '--project', root, '--harness', 'codex', '--inventory', inventoryFile,
    ], { cwd: new URL('..', import.meta.url).pathname });
    const entry = JSON.parse(stdout).inventory.entries[0];
    assert.equal(entry.status, 'unknown');
    assert.equal(entry.source, 'operator-supplied unverified inventory');
  } finally {
    await rm(inventoryFile, { force: true });
  }
});

test('doctor inventories bounded harness skill and workflow metadata as installed only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portable-doctor-skills-'));
  await mkdir(join(root, '.claude', 'skills', 'review'), { recursive: true });
  await mkdir(join(root, '.kilo', 'skills', 'deploy'), { recursive: true });
  await mkdir(join(root, '.opencode', 'workflows'), { recursive: true });
  await writeFile(join(root, '.claude', 'skills', 'review', 'SKILL.md'), '# review');
  await writeFile(join(root, '.kilo', 'skills', 'deploy', 'SKILL.md'), '# deploy');
  await writeFile(join(root, '.opencode', 'workflows', 'plan.md'), '# plan');
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      'bin/doctor.mjs', '--project', root, '--harness', 'codex',
    ], { cwd: new URL('..', import.meta.url).pathname });
    const entries = JSON.parse(stdout).inventory.entries;
    assert.deepEqual(entries.map((entry) => [entry.id, entry.kind, entry.status]).sort(), [
      ['deploy', 'skill', 'installed'],
      ['plan', 'workflow', 'installed'],
      ['review', 'skill', 'installed'],
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('doctor discovers user skills only with the explicit user-skill flag', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portable-user-skills-'));
  await mkdir(join(root, '.claude', 'skills', 'private-review'), { recursive: true });
  await writeFile(join(root, '.claude', 'skills', 'private-review', 'SKILL.md'), '# review');
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      'bin/doctor.mjs', '--project', await fixturePath('empty'), '--harness', 'codex', '--user-skills',
    ], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, HOME: root } });
    const entry = JSON.parse(stdout).inventory.entries.find((item) => item.id === 'private-review');
    assert.equal(entry.scope, 'user');
    assert.equal(entry.status, 'installed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('doctor performs RTK preflight only when native core is explicitly requested', async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    'bin/doctor.mjs', '--project', await fixturePath('empty'), '--harness', 'codex', '--native-core',
  ], { cwd: new URL('..', import.meta.url).pathname });
  const entry = JSON.parse(stdout).inventory.entries.find((item) => item.id === 'rtk');
  assert.equal(entry.kind, 'cli');
  assert.equal(entry.source, 'native core preflight');
  assert.ok(['callable', 'unknown'].includes(entry.status));
});

test('doctor maps Stripe manifest evidence to the billing capability only for explicit provider-state signals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'portable-billing-profile-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { stripe: '1' } }));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      'bin/doctor.mjs', '--project', root, '--harness', 'codex',
      '--task', 'bug', '--phase', 'investigate', '--role', 'diagnostician', '--signals', 'stripe,provider-state',
    ], { cwd: new URL('..', import.meta.url).pathname });
    const plan = JSON.parse(stdout).capability_plan;
    assert.ok(plan.required.some((requirement) => requirement.id === 'billing.provider_evidence'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('parses project orchestration bindings from AGENTS.md into the discovered profile', async () => {
  const profile = await discoverProject({ root: await fixturePath('with-bindings') });

  assert.ok(profile.bindings, 'expected bindings to be present');
  assert.deepEqual(profile.bindings.mandatory_commands, ['npm test', 'npm run lint']);
  assert.deepEqual(profile.bindings.live_mcps, ['context7', 'sequential-thinking']);
  assert.deepEqual(profile.bindings.agent_overrides, {
    'backend-fixer': 'db-migration-author',
    'code-reviewer': 'adversarial-skeptic',
  });
  assert.equal(profile.bindings.domain_rules.length, 2);
  assert.ok(profile.bindings.domain_rules[0].includes('Payments'));
});

test('yields null bindings when AGENTS.md has no orchestration bindings section', async () => {
  const profile = await discoverProject({ root: await fixturePath('empty') });
  assert.equal(profile.bindings, null);
});
