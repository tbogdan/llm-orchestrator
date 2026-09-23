// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { applyInstallation, planInstallation, uninstallInstallation } from '../lib/installation.mjs';
import { FLOW_MARKER, pluginHooksFile, extractFlowGroups } from '../adapters/hooks.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'flow-hooks-'));
  const project = join(base, 'project');
  await mkdir(project, { recursive: true });
  return { base, project, stateRoot: join(base, 'state'), skillsRoot: join(base, 'skills'), prompts: join(base, 'prompts') };
}

const options = (fx, extra = {}) => ({ project: fx.project, packageRoot: root, stateRoot: fx.stateRoot, skillsRoot: fx.skillsRoot, harnesses: ['claude'], ...extra });
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const USER_SETTINGS = {
  permissions: { allow: ['Bash(npm test)'] },
  hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo user-hook' }] }] },
};

test('claude: flow hooks merge into .claude/settings.json and leave everything else untouched', async () => {
  const fx = await fixture();
  const settingsPath = join(fx.project, '.claude', 'settings.json');
  await mkdir(join(fx.project, '.claude'), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(USER_SETTINGS, null, 2)}\n`);

  const first = await applyInstallation(options(fx));
  assert.deepEqual(first.conflicts, []);
  const settings = await readJson(settingsPath);
  assert.deepEqual(settings.permissions, USER_SETTINGS.permissions);
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, 'echo user-hook', 'the user hook stays first and unchanged');
  for (const event of ['UserPromptSubmit', 'PreToolUse', 'SubagentStart', 'Stop', 'SessionEnd']) {
    assert.ok(settings.hooks[event].some((group) => group.hooks[0].command.includes(FLOW_MARKER)), `${event} flow hook missing`);
  }
  assert.equal(first.manifest.json_entries.length, 1);
  assert.equal(first.manifest.json_entries[0].created_file, false);
  assert.ok(!first.manifest.files.some((file) => file.path === '.claude/settings.json'), 'the settings file itself is never owned');

  const second = await applyInstallation(options(fx));
  assert.deepEqual(second.changes, [], 'a second install is a no-op');

  const removed = await uninstallInstallation(options(fx));
  assert.ok(removed.changes.some((change) => change.path === '.claude/settings.json' && change.action === 'remove-hooks'));
  assert.deepEqual(await readJson(settingsPath), USER_SETTINGS, 'uninstall restores the user settings exactly');
});

test('claude: a hand-edited flow hook is a conflict, not an overwrite', async () => {
  const fx = await fixture();
  await applyInstallation(options(fx));
  const settingsPath = join(fx.project, '.claude', 'settings.json');
  const settings = await readJson(settingsPath);
  settings.hooks.PreToolUse[0].hooks[0].timeout = 99;
  await writeFile(settingsPath, JSON.stringify(settings));
  const plan = await planInstallation(options(fx));
  assert.ok(plan.conflicts.includes('.claude/settings.json'));
  const removed = await uninstallInstallation(options(fx));
  assert.ok(removed.preserved.includes('.claude/settings.json'));
  assert.equal((await readJson(settingsPath)).hooks.PreToolUse[0].hooks[0].timeout, 99);
});

test('claude: an unparseable settings file is a conflict', async () => {
  const fx = await fixture();
  await mkdir(join(fx.project, '.claude'), { recursive: true });
  await writeFile(join(fx.project, '.claude', 'settings.json'), '{ "permissions": ');
  const plan = await planInstallation(options(fx));
  assert.ok(plan.conflicts.includes('.claude/settings.json'));
});

test('codex: a created .codex/hooks.json is removed entirely on uninstall; prompts leave with it', async () => {
  const fx = await fixture();
  const codex = options(fx, { harnesses: ['codex'], codexPromptsRoot: fx.prompts });
  await applyInstallation(codex);
  const hooks = await readJson(join(fx.project, '.codex', 'hooks.json'));
  assert.match(hooks.hooks.PreToolUse[0].hooks[0].command, /gate --project/);
  await readFile(join(fx.prompts, 'task.md'), 'utf8');

  await uninstallInstallation(codex);
  await assert.rejects(readFile(join(fx.project, '.codex', 'hooks.json')));
  await assert.rejects(readFile(join(fx.prompts, 'task.md')), 'codex prompts must be removed from the prompts root');
});

test('opencode and kilo: own plugin files, created and removed', async () => {
  const fx = await fixture();
  const both = options(fx, { harnesses: ['opencode', 'kilo'] });
  await applyInstallation(both);
  for (const path of ['.opencode/plugins/orchestrate-flow.js', '.kilo/plugin/orchestrate-flow.js']) {
    const text = await readFile(join(fx.project, path), 'utf8');
    assert.match(text, /tool\.execute\.before/);
    assert.doesNotMatch(text, /throw /, 'the plugin must never throw and block a tool');
  }
  await uninstallInstallation(both);
  await assert.rejects(readFile(join(fx.project, '.opencode', 'plugins', 'orchestrate-flow.js')));
});

test('--no-flow-hooks installs none, persists, and withdraws hooks a previous install wrote', async () => {
  const fx = await fixture();
  const none = await applyInstallation(options(fx, { harnesses: ['claude', 'opencode'], flowHooks: false }));
  assert.equal(none.manifest.flow_hooks, false);
  await assert.rejects(readFile(join(fx.project, '.claude', 'settings.json')));
  await assert.rejects(readFile(join(fx.project, '.opencode', 'plugins', 'orchestrate-flow.js')));

  const again = await applyInstallation(options(fx, { harnesses: ['claude'] }));
  assert.equal(again.manifest.flow_hooks, false, 'the choice survives a reinstall without the flag');

  await applyInstallation(options(fx, { harnesses: ['claude', 'opencode'], flowHooks: true }));
  await readFile(join(fx.project, '.claude', 'settings.json'), 'utf8');
  const off = await applyInstallation(options(fx, { harnesses: ['claude', 'opencode'], flowHooks: false }));
  assert.deepEqual(off.conflicts, []);
  await assert.rejects(readFile(join(fx.project, '.claude', 'settings.json')), 'a settings file the install created goes when its hooks go');
  await assert.rejects(readFile(join(fx.project, '.opencode', 'plugins', 'orchestrate-flow.js')));
  assert.deepEqual(off.manifest.json_entries, []);
});

test('the plugin hooks/hooks.json is exactly the rendered plugin footprint', async () => {
  assert.equal(await readFile(join(root, 'hooks', 'hooks.json'), 'utf8'), pluginHooksFile());
  const groups = extractFlowGroups(JSON.parse(pluginHooksFile()));
  assert.deepEqual(Object.keys(groups).sort(), ['PreToolUse', 'SessionEnd', 'Stop', 'SubagentStart', 'UserPromptSubmit']);
  for (const [, eventGroups] of Object.entries(groups)) {
    const { command, timeout } = eventGroups[0].hooks[0];
    assert.match(command, /\|\| true # orchestrate-core:flow$/, 'a missing runtime must stay silent');
    assert.equal(timeout, 3);
  }
});

test('the plugin ships the orchestrator roles as agents, exactly as rendered', async () => {
  const { agentFiles } = await import('../adapters/agents.mjs');
  const { readdir } = await import('node:fs/promises');
  const rendered = agentFiles('agents');
  assert.deepEqual((await readdir(join(root, 'agents'))).sort(), rendered.map(({ path }) => path.slice('agents/'.length)).sort());
  for (const { path, content } of rendered) assert.equal(await readFile(join(root, path), 'utf8'), content, `${path} drifted from the renderer`);
});
