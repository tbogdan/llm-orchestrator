import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync as readRegistryFile } from 'node:fs';

import { renderAdapter } from '../lib/adapter-renderer.mjs';
import { agentFiles } from '../adapters/agents.mjs';

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
    const expected = agentFiles(directory, harness);
    assert.deepEqual(agents.map(({path, content}) => ({path, content})), expected, `${harness}: agent files must use the ${harness} frontmatter`);
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

// ---------------------------------------------------------------- rendered agent files
// Frontmatter must be valid YAML for every consumer (GitHub, Claude Code, OpenCode,
// Kilo). An unquoted description containing ": " is a YAML mapping error, so the
// contract is: name is a plain id, description is a JSON (= YAML double-quoted) string.
const agentRegistry = JSON.parse(readRegistryFile(new URL('../registries/agent-roles.json', import.meta.url), 'utf8'));

function splitFrontmatter(content) {
  assert.ok(content.startsWith('---\n'), 'agent file must open with a frontmatter fence');
  const end = content.indexOf('\n---\n', 4);
  assert.ok(end > 0, 'agent file must close its frontmatter fence');
  return {frontmatter: content.slice(4, end).split('\n'), body: content.slice(end + 5)};
}

// A role whose permission profile does not grant `edit` must not get edit tools
// from its native agent file (policies/dispatch.md: RO and ORCHESTRATOR are `edit: deny`).
const editDenied = (role) => !agentRegistry.permission_profiles[role.permission_profile].required_access.includes('edit');

// The frontmatter subset these files use: top-level `key: value`, and one level of
// two-space-indented `key: value` under a key with an empty value.
function parseFrontmatter(lines, where) {
  const top = [];
  const nested = {};
  let parent = null;
  for (const line of lines) {
    const match = /^( {2})?([A-Za-z][A-Za-z0-9_-]*): ?(.*)$/.exec(line);
    assert.ok(match, `${where}: frontmatter line is not a plain key/value: ${JSON.stringify(line)}`);
    const [, indent, key, value] = match;
    if (indent) {
      assert.ok(parent, `${where}: indented key ${key} has no parent`);
      nested[parent].push([key, value]);
    } else {
      top.push([key, value]);
      parent = value === '' ? key : null;
      if (parent) nested[key] = [];
    }
  }
  return {top, nested};
}

test('every rendered agent file has YAML-safe frontmatter: plain id name, JSON-quoted description', () => {
  for (const harness of ['claude', 'opencode', 'kilo']) {
    const rendered = agentFiles('agents', harness);
    assert.equal(rendered.length, agentRegistry.roles.length);
    for (const role of agentRegistry.roles) {
      const where = `${harness}/${role.id}`;
      const file = rendered.find(({path}) => path === `agents/${role.id}.md`);
      assert.ok(file, `no rendered file for ${where}`);
      const {top, nested} = parseFrontmatter(splitFrontmatter(file.content).frontmatter, where);
      const values = Object.fromEntries(top);
      assert.deepEqual(top.slice(0, 2).map(([key]) => key), ['name', 'description'], `${where}: frontmatter opens with name, description`);
      assert.match(values.name, /^[a-z0-9-]+$/, `${where}: name must be a plain id`);
      assert.equal(values.name, role.id);
      assert.match(values.description, /^".*"$/, `${where}: description must be a double-quoted scalar, got ${values.description}`);
      assert.equal(JSON.parse(values.description), role.description, `${where}: description must round-trip`);
      for (const [key, value] of top.slice(2)) {
        // Every other value is a plain scalar with no YAML indicator characters.
        if (value !== '') assert.match(value, /^[A-Za-z][A-Za-z0-9 ,]*$/, `${where}: ${key} value is not a plain scalar: ${value}`);
      }
      for (const [parent, entries] of Object.entries(nested)) {
        for (const [key, value] of entries) assert.match(value, /^[a-z]+$/, `${where}: ${parent}.${key} value is not a plain scalar: ${value}`);
      }
    }
  }
});

test('Claude agent files deny edit tools to roles whose permission profile does not grant edit', () => {
  for (const {content, path} of agentFiles('agents')) {
    const role = agentRegistry.roles.find(({id}) => path === `agents/${id}.md`);
    const {top} = parseFrontmatter(splitFrontmatter(content).frontmatter, role.id);
    const keys = top.map(([key]) => key);
    if (editDenied(role)) {
      assert.deepEqual(keys, ['name', 'description', 'disallowedTools'], `${role.id}: frontmatter keys`);
      assert.equal(Object.fromEntries(top).disallowedTools, 'Write, Edit, NotebookEdit', `${role.id}: disallowedTools`);
    } else {
      assert.deepEqual(keys, ['name', 'description'], `${role.id}: an RW role keeps the default tool set`);
    }
    assert.ok(!keys.includes('mode') && !keys.includes('permission'), `${role.id}: Claude files carry no OpenCode keys`);
  }
});

test('OpenCode and Kilo agent files declare subagent/primary mode and deny edit where the profile does', () => {
  for (const harness of ['opencode', 'kilo']) {
    for (const {content, path} of agentFiles('agents', harness)) {
      const role = agentRegistry.roles.find(({id}) => path === `agents/${id}.md`);
      const where = `${harness}/${role.id}`;
      const {top, nested} = parseFrontmatter(splitFrontmatter(content).frontmatter, where);
      const values = Object.fromEntries(top);
      assert.equal(values.mode, role.permission_profile === 'ORCHESTRATOR' ? 'primary' : 'subagent', `${where}: mode`);
      assert.ok(!('disallowedTools' in values), `${where}: carries no Claude keys`);
      if (editDenied(role)) {
        assert.equal(values.permission, '', `${where}: permission must be a mapping`);
        assert.deepEqual(nested.permission, [['edit', 'deny']], `${where}: permission`);
      } else {
        assert.ok(!('permission' in values), `${where}: an RW role keeps the default permissions`);
      }
    }
  }
});

test('the ORCHESTRATOR permission profile does not grant edit (policies/dispatch.md: edit deny)', () => {
  const profile = agentRegistry.permission_profiles.ORCHESTRATOR;
  assert.ok(!profile.required_access.includes('edit') && !profile.required_access.includes('write'), 'ORCHESTRATOR must not require edit/write');
  const policy = readRegistryFile(new URL('../policies/dispatch.md', import.meta.url), 'utf8');
  assert.match(policy, /\| `ORCHESTRATOR` \|[^\n]*`edit: deny`/, 'policies/dispatch.md no longer states ORCHESTRATOR edit: deny');
});

test('agentFiles uses the Claude format by default and rejects an unknown harness', () => {
  assert.deepEqual(agentFiles('agents'), agentFiles('agents', 'claude'));
  assert.throws(() => agentFiles('agents', 'vim'), /harness/);
});

test('every registry role carries a charter and its rendered body is a role-specific system prompt', () => {
  const rendered = agentFiles('agents');
  const safe = (text, where) => {
    assert.equal(typeof text, 'string', `${where} must be a string`);
    assert.ok(text.trim().length > 0, `${where} must not be empty`);
    assert.doesNotMatch(text, /[\r\n]/, `${where} must be one line`);
    assert.doesNotMatch(text, /^\s*(#|-|\*|>|\d+\.|---|<)/, `${where} must not start with markdown syntax`);
  };
  const bodies = new Set();
  for (const role of agentRegistry.roles) {
    const {charter} = role;
    assert.ok(charter && typeof charter === 'object', `${role.id} has no charter`);
    safe(charter.mission, `${role.id}.charter.mission`);
    safe(charter.handoff, `${role.id}.charter.handoff`);
    for (const [key, min, max] of [['principles', 3, 5], ['done_when', 2, 4], ['never', 2, 4]]) {
      assert.ok(Array.isArray(charter[key]), `${role.id}.charter.${key} must be an array`);
      assert.ok(charter[key].length >= min && charter[key].length <= max, `${role.id}.charter.${key} must hold ${min}-${max} items`);
      charter[key].forEach((item, index) => safe(item, `${role.id}.charter.${key}[${index}]`));
    }
    const {body} = splitFrontmatter(rendered.find(({path}) => path === `agents/${role.id}.md`).content);
    const profile = agentRegistry.permission_profiles[role.permission_profile];
    for (const text of [charter.mission, charter.handoff, ...charter.principles, ...charter.done_when, ...charter.never, ...profile.rules]) {
      assert.ok(body.includes(text), `${role.id}: body is missing "${text}"`);
    }
    for (const item of [...role.skills, ...role.mcps]) assert.ok(body.includes(`\`${item}\``), `${role.id}: body does not name ${item}`);
    assert.ok(body.includes(`\nBest for: ${role.best_for}\n`), `${role.id}: body is missing its "Best for:" line`);
    for (const universal of [/Mandatory — before acting/, /Permission profile: /, /question_for_user/, /used_mcps/, /exit status/, /owned files/]) {
      assert.match(body, universal, `${role.id}: body is missing ${universal}`);
    }
    assert.doesNotMatch(body, /^---\s*$/m, `${role.id}: body must not contain a YAML fence line`);
    const lines = body.trim().split('\n').length;
    assert.ok(lines >= 20 && lines <= 50, `${role.id}: body is ${lines} lines, expected 20-50`);
    bodies.add(body.replace(/`[^`]*`/g, ''));
  }
  assert.equal(bodies.size, agentRegistry.roles.length, 'every agent body must be distinct');
});

test('a role without a charter is a registry error, not a silent generic body', () => {
  const registry = structuredClone(agentRegistry);
  delete registry.roles.find(({id}) => id === 'general').charter;
  assert.throws(() => agentFiles('agents', 'claude', registry), /general.*charter/);
});

// policies/dispatch.md is the source of the handoff field names; every agent file
// must render exactly that list, in that order, so the two cannot drift.
test('every agent body renders the canonical handoff fields from policies/dispatch.md', () => {
  const policy = readRegistryFile(new URL('../policies/dispatch.md', import.meta.url), 'utf8');
  const block = /Handoff schema:\s*((?:`[a-z_]+`[,\s]*)+)/.exec(policy);
  assert.ok(block, 'policies/dispatch.md has no "Handoff schema:" field list');
  const fields = [...block[1].matchAll(/`([a-z_]+)`/g)].map(([, name]) => name);
  assert.ok(fields.length >= 6, `parsed only ${fields.length} handoff fields`);
  const line = fields.map((name) => `\`${name}\``).join(', ');
  for (const {path, content} of agentFiles('agents')) {
    const {body} = splitFrontmatter(content);
    assert.ok(body.includes(line), `${path}: handoff field list diverges from policies/dispatch.md (${line})`);
  }
});

test('used_mcps reporting covers required MCPs with their unavailable/error result', () => {
  for (const {path, content} of agentFiles('agents')) {
    const {body} = splitFrontmatter(content);
    assert.match(body, /`used_mcps`[^\n]*every MCP[^\n]*called[^\n]*every required MCP[^\n]*unavailable or error result[^\n]*silent omission fails the gate/i, `${path}: used_mcps rule is weaker than policies/dispatch.md`);
  }
});

// Only real MCP server ids may be rendered as MCPs. Capability classes whose
// implementation the project binds (a database client, a provider API) are
// rendered as capabilities, never as a server name to search for.
test('role MCPs are real server ids; placeholder tools are rendered as capability classes', () => {
  const preferred = JSON.parse(readRegistryFile(new URL('../registries/preferred-tools.json', import.meta.url), 'utf8')).tools;
  const realMcp = (name) => preferred.some((tool) => tool.kind === 'mcp' && tool.installable === true && (tool.id === name || (tool.aliases ?? []).includes(name)));
  const knownCapability = (id) => preferred.some((tool) => (tool.capabilities ?? []).includes(id));
  const rendered = agentFiles('agents');
  for (const role of agentRegistry.roles) {
    const {body} = splitFrontmatter(rendered.find(({path}) => path === `agents/${role.id}.md`).content);
    for (const name of role.mcps) {
      assert.ok(realMcp(name), `${role.id}: mcps entry ${name} is not an installable MCP server in registries/preferred-tools.json`);
      // The registry names the canonical server id; an alias (the tool name the policies
      // call) is rendered next to it, never in its place.
      const entry = preferred.find((tool) => tool.kind === 'mcp' && tool.id === name);
      assert.ok(entry, `${role.id}: mcps entry ${name} is an alias; use the canonical server id from registries/preferred-tools.json`);
      for (const alias of entry.aliases ?? []) {
        assert.ok(body.includes(`\`${name}\` (alias \`${alias}\`)`), `${role.id}: body must render ${name} with its alias ${alias}`);
      }
    }
    for (const need of role.tool_capabilities ?? []) {
      assert.ok(knownCapability(need.capability), `${role.id}: tool capability ${need.capability} is not a known capability id`);
      assert.ok(body.includes(`${need.label} (\`${need.capability}\` capability`), `${role.id}: body does not render ${need.capability} as a capability class`);
    }
    for (const placeholder of ['db-client', 'billing-provider-api', 'push-provider-api']) {
      assert.ok(!body.includes(`\`${placeholder}\``), `${role.id}: body names placeholder ${placeholder} as a tool`);
    }
  }
  const byId = Object.fromEntries(agentRegistry.roles.map((role) => [role.id, role]));
  assert.ok(byId.orchestrator.mcps.includes('sequential-thinking'), 'orchestrator must name the sequential-thinking MCP by its canonical server id');
  const orchestratorBody = splitFrontmatter(rendered.find(({path}) => path === 'agents/orchestrator.md').content).body;
  assert.ok(orchestratorBody.includes('`sequential-thinking` (alias `sequentialthinking`)'), 'orchestrator must render the canonical id with the sequentialthinking alias');
  for (const id of ['db-concurrency-specialist', 'db-migration-author']) {
    assert.ok(byId[id].tool_capabilities.some(({capability}) => capability === 'database.schema_provenance'), `${id}: database client capability`);
  }
});

test('role charters agree with the dispatch, verification and question policies', () => {
  const byId = Object.fromEntries(agentRegistry.roles.map((role) => [role.id, role]));
  const body = (id) => splitFrontmatter(agentFiles('agents').find(({path}) => path === `agents/${id}.md`).content).body;

  // Orchestrator: edit deny — it never implements a shard; `general` takes unowned work.
  const orchestrator = body('orchestrator');
  assert.doesNotMatch(orchestrator, /implement a shard yourself only|edit owned files yourself/, 'orchestrator may not implement shards itself');
  assert.match(orchestrator, /no specialist[^\n]*`general`/, 'orchestrator must dispatch unowned work to general');
  assert.match(orchestrator, /never edit[^\n]*files? yourself/i, 'orchestrator must never edit files itself');
  // Nested: never close the parent's run; the handoff is the end.
  assert.match(orchestrator, /never close[^\n]*parent's run/i);
  assert.match(orchestrator, /nested[^\n]*done[^\n]*handoff|handoff[^\n]*nested/i);
  // Final report: no free-text question; open questions go through the native mechanism.
  assert.doesNotMatch(orchestrator, /\(or null\)/, 'orchestrator report must not render a question_for_user field');
  assert.match(orchestrator, /## Handoff\n[^#]*native question mechanism[^#]*batched once/, 'orchestrator handoff must route open questions through the native mechanism');

  // backend-fixer carries the CONFIG flow (workflows/config.md) where G3 is not_applicable.
  for (const id of ['backend-fixer', 'frontend-fixer']) {
    const text = [...byId[id].charter.principles, ...byId[id].charter.done_when].join('\n');
    assert.match(text, /not_applicable/, `${id}: charter must cover a G3 not_applicable dispatch`);
  }
  assert.match(byId['backend-fixer'].charter.done_when.join('\n'), /config/i, 'backend-fixer done_when must cover a config change');

  // test-engineer owns the RED phase only (one session, one phase).
  const done = byId['test-engineer'].charter.done_when.join('\n');
  assert.match(done, /RED/);
  assert.match(done, /only when dispatched for the post-fix phase/);
});

// The orchestrator agent is edit-denied, so a declared trivial change still goes to a
// dispatched worker; protocol.md and the charter must say so, not imply main-thread edits.
test('a trivial change under the orchestrator agent is dispatched to general', () => {
  const orchestrator = splitFrontmatter(agentFiles('agents').find(({path}) => path === 'agents/orchestrator.md').content).body;
  assert.match(orchestrator, /trivial change[^\n]*`general`/i, 'orchestrator charter must dispatch a trivial change to general');
  const protocol = readRegistryFile(new URL('../protocol.md', import.meta.url), 'utf8');
  const trivial = /\*\*Trivial tasks\.\*\*[\s\S]*?\n\n/.exec(protocol)?.[0] ?? '';
  assert.match(trivial, /orchestrator agent[^.]*`general`/, 'protocol.md trivial paragraph must route the change to general under the orchestrator agent');
  assert.match(trivial, /default build agent/, 'protocol.md trivial paragraph must cover harnesses without an orchestrator agent');
});

// Edit denial removes the edit tools, not shell writes: every read-only role says so.
test('read-only roles state that edit denial does not sandbox shell writes', () => {
  const line = 'Bash is for inspection only; edit denial does not sandbox shell writes — never write through the shell.';
  for (const role of agentRegistry.roles) {
    const {body} = splitFrontmatter(agentFiles('agents').find(({path}) => path === `agents/${role.id}.md`).content);
    const permissions = /## Permissions\n[^#]*/.exec(body)[0];
    assert.equal(permissions.includes(line), role.permission_profile === 'RO', `${role.id}: shell-write caveat ${role.permission_profile === 'RO' ? 'missing from' : 'must not appear in'} its Permissions section`);
  }
});

// The global skill and the project bridge are two files; the agents name both, as commands.mjs does.
test('agent bodies name the orchestrate-core skill and the project bridge separately', () => {
  for (const {path, content} of agentFiles('agents')) {
    const {body} = splitFrontmatter(content);
    assert.ok(body.includes('Mandatory — before acting, load and follow the `orchestrate-core` skill (or, in a project install, the bridge `.agents/skills/orchestrate/SKILL.md`).'), `${path}: orchestrate-core line conflates the skill and the bridge`);
  }
});

test('README install and agent docs match what the installer writes', () => {
  const readme = readRegistryFile(new URL('../README.md', import.meta.url), 'utf8');
  const claudeRow = readme.split('\n').find((row) => row.startsWith('| Claude Code (full)'));
  assert.ok(claudeRow, 'README has no "Claude Code (full)" install row');
  assert.doesNotMatch(claudeRow, /skill \+ commands \+ agent\b/, 'install --apply writes no agents without --with-agents');
  assert.match(claudeRow, /role agents with `--with-agents`/);
  assert.match(readme, /built-in `general` and `explore`[^\n]*(replace|override)/i, 'README must document that rendered general/explore override the OpenCode/Kilo built-ins');
  assert.match(readme, /edit denial does not sandbox shell writes/i, 'README must document that edit denial is not a shell sandbox');
});
