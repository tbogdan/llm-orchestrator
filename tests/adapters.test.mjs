import assert from 'node:assert/strict';
import test from 'node:test';

import { renderAdapter } from '../lib/adapter-renderer.mjs';

test('renders the Codex bridge without machine paths or permission changes', () => {
  const result = renderAdapter({harness: 'codex', capabilities: [], installMode: 'external', existingFiles: {}});

  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.permissionEscalations, []);
  assert.deepEqual(result.files.map(({path}) => path), [
    'AGENTS.md',
    '.agents/skills/orchestrate/SKILL.md',
  ]);
  assert.equal((result.files[0].content.match(/orchestration entrypoint/g) ?? []).length, 1);
  assert.match(result.files[1].content, /Discover the installed global `orchestrate-core` skill/);
  assert.match(result.files[1].content, /^---\nname: orchestrate\ndescription: /);
  assert.match(result.files[1].content, /degraded mode/);
  assert.doesNotMatch(result.files.map(({content}) => content).join('\n'), /\/Users\/|C:\\Users|permission/i);
});

test('renders only the selected harness native command in its known directory', () => {
  for (const [harness, expected] of Object.entries({
    claude: ['.claude/commands/orchestrate.md', 'CLAUDE.md'],
    opencode: ['.opencode/commands/orchestrate.md'],
    kilo: ['.kilo/commands/orchestrate.md'],
  })) {
    const result = renderAdapter({harness, capabilities: [], installMode: 'external', existingFiles: {}});
    assert.deepEqual(result.conflicts, []);
    assert.ok(result.files.some(({path}) => path === '.agents/skills/orchestrate/SKILL.md'));
    const commands = result.files.filter(({kind}) => kind === 'native-command').map(({path}) => path);
    assert.deepEqual(commands, [
      expected[0],
      expected[0].replace('/orchestrate.md', '/task.md'),
      expected[0].replace('/orchestrate.md', '/task-plan.md'),
      expected[0].replace('/orchestrate.md', '/task-status.md'),
      expected[0].replace('/orchestrate.md', '/task-cancel.md'),
      expected[0].replace('/orchestrate.md', '/task-verify.md'),
      expected[0].replace('/orchestrate.md', '/incident-start.md'),
      expected[0].replace('/orchestrate.md', '/incident-evidence.md'),
      expected[0].replace('/orchestrate.md', '/incident-fix.md'),
      expected[0].replace('/orchestrate.md', '/incident-verify.md'),
      expected[0].replace('/orchestrate.md', '/incident-close.md'),
    ]);
    for (const file of result.files.filter(({kind}) => kind === 'native-command')) {
      assert.match(file.content, /^---\ndescription: /);
      const frontmatter = file.content.split('---')[1] ?? '';
      assert.doesNotMatch(frontmatter, /permissions?|allow:\s*\*/i, 'command frontmatter must not grant access');
      assert.doesNotMatch(file.content, /allow:\s*\*/i);
      assert.match(file.content, /\.agents\/skills\/orchestrate\/SKILL\.md/);
      assert.match(file.content, /Arguments: \$ARGUMENTS/);
      const lines = file.content.split('\n');
      assert.equal(lines[0], '---');
      const closing = lines.indexOf('---', 1);
      assert.ok(closing > 0);
      assert.match(lines[closing + 1], /^<!-- llm-orchestrator/);
    }
    const byPath = Object.fromEntries(result.files.filter(({kind}) => kind === 'native-command').map((file) => [file.path, file.content]));
    assert.match(byPath[expected[0]], /Mode: execute/);
    assert.match(byPath[expected[0].replace('/orchestrate.md', '/task-plan.md')], /Mode: plan[\s\S]*read-only[\s\S]*do not dispatch builders/i);
    assert.match(byPath[expected[0].replace('/orchestrate.md', '/task-status.md')], /Mode: status[\s\S]*do not resume/i);
    assert.match(byPath[expected[0].replace('/orchestrate.md', '/task-cancel.md')], /Mode: cancel[\s\S]*owned[\s\S]*Preserve current changes[\s\S]*do not perform cleanup/i);
    assert.match(byPath[expected[0].replace('/orchestrate.md', '/task-verify.md')], /Mode: verify[\s\S]*evidence[\s\S]*do not perform cleanup/i);
    assert.match(byPath[expected[0].replace('/orchestrate.md', '/task.md')], /Mandatory —[\s\S]*orchestration\.bootstrap[\s\S]*verification\.checks/);
    assert.match(byPath[expected[0].replace('/orchestrate.md', '/incident-start.md')], /Mode: incident-start[\s\S]*read-only/i);
    assert.match(byPath[expected[0].replace('/orchestrate.md', '/incident-evidence.md')], /Mode: incident-evidence[\s\S]*evidence/i);
    assert.match(byPath[expected[0].replace('/orchestrate.md', '/incident-fix.md')], /Mode: incident-fix[\s\S]*mandatory verification/i);
    assert.match(byPath[expected[0].replace('/orchestrate.md', '/incident-verify.md')], /Mode: incident-verify[\s\S]*Do not close the incident/i);
    assert.match(byPath[expected[0].replace('/orchestrate.md', '/incident-close.md')], /Mode: incident-close[\s\S]*verification evidence is recorded/i);
    for (const path of expected.slice(1)) assert.ok(result.files.some((file) => file.path === path));
  }
});

test('reports a user-owned generated file conflict and reuses exact compatible content', () => {
  const baseline = renderAdapter({harness: 'claude', capabilities: [], installMode: 'external', existingFiles: {}});
  const bridge = baseline.files.find(({path}) => path === '.agents/skills/orchestrate/SKILL.md');
  const conflict = renderAdapter({
    harness: 'claude', capabilities: [], installMode: 'external',
    existingFiles: {'.agents/skills/orchestrate/SKILL.md': 'user bridge'},
  });
  assert.deepEqual(conflict.conflicts, ['.agents/skills/orchestrate/SKILL.md']);

  const reused = renderAdapter({
    harness: 'claude', capabilities: [], installMode: 'external',
    existingFiles: {'.agents/skills/orchestrate/SKILL.md': bridge.content},
  });
  assert.deepEqual(reused.conflicts, []);
  assert.equal(reused.files.find(({path}) => path === bridge.path).action, 'reuse');
});

test('Claude Code aliases render canonical Claude adapters', () => {
  for (const harness of ['claude-code', 'claude code']) {
    assert.deepEqual(renderAdapter({harness}), renderAdapter({harness: 'claude'}));
  }
});

test('does not render Codex prompts or agent files unless explicitly requested', () => {
  const result = renderAdapter({harness: 'codex', capabilities: [], installMode: 'external', existingFiles: {}});
  assert.deepEqual(result.files.filter(({kind}) => kind === 'codex-prompt'), []);
  assert.deepEqual(result.files.filter(({kind}) => kind === 'agent-file'), []);
});

test('renders Codex prompts at bare filenames (installed under the operator-chosen prompts root)', () => {
  const result = renderAdapter({harness: 'codex', capabilities: [], installMode: 'external', existingFiles: {}, codexPrompts: true});
  const prompts = result.files.filter(({kind}) => kind === 'codex-prompt');
  assert.ok(prompts.length >= 11);
  assert.ok(prompts.every(({path}) => !path.includes('/')));
  assert.ok(prompts.some(({path}) => path === 'orchestrate.md'));
  assert.ok(prompts.some(({path}) => path === 'incident-close.md'));
  for (const {content} of prompts) assert.match(content, /^---\ndescription: /);
});

test('renders one agent file per registry role into the harness-specific agent directory when --with-agents is set', () => {
  for (const [harness, directory] of Object.entries({claude: '.claude/agents', opencode: '.opencode/agent', kilo: '.kilo/agent'})) {
    const result = renderAdapter({harness, capabilities: [], installMode: 'external', existingFiles: {}, withAgents: true});
    const agents = result.files.filter(({kind}) => kind === 'agent-file');
    assert.ok(agents.length > 0);
    assert.ok(agents.every(({path}) => path.startsWith(`${directory}/`)));
    assert.ok(agents.some(({path}) => path === `${directory}/orchestrator.md`));
    for (const {content} of agents) {
      assert.match(content, /^---\nname: /);
      assert.match(content, /Mandatory — before acting/);
      assert.match(content, /Permission profile: /);
    }
  }
});

test('reports an agent-file conflict against a differing user-owned file', () => {
  const baseline = renderAdapter({harness: 'claude', capabilities: [], installMode: 'external', existingFiles: {}, withAgents: true});
  const orchestrator = baseline.files.find(({path}) => path === '.claude/agents/orchestrator.md');
  const conflict = renderAdapter({
    harness: 'claude', capabilities: [], installMode: 'external', withAgents: true,
    existingFiles: {'.claude/agents/orchestrator.md': 'user-authored agent'},
  });
  assert.deepEqual(conflict.conflicts, ['.claude/agents/orchestrator.md']);
  const reused = renderAdapter({
    harness: 'claude', capabilities: [], installMode: 'external', withAgents: true,
    existingFiles: {'.claude/agents/orchestrator.md': orchestrator.content},
  });
  assert.deepEqual(reused.conflicts, []);
});
