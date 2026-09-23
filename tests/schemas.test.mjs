// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
/**
 * Every published schema is checked against something real: a registry file, or
 * the live output of the code that produces that shape. Four of these schemas
 * had no test at all and two had silently drifted from the code — the manifest
 * schema did not know about Codex prompt files or rendered agent files, and the
 * project profile schema rejected the `bindings: null` that discovery emits for
 * a project without an orchestration bindings section.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, cp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validate } from './schema-validator.mjs';
import { discoverProject } from '../lib/project-discovery.mjs';
import { discoverTools } from '../lib/tool-discovery.mjs';
import { handleHook } from '../lib/flow-gate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(root + path, 'utf8'));
const schema = (name) => readJson(`schemas/${name}.schema.json`);

test('every schema declares an $id that names this package', () => {
  const names = [
    'agent-roles', 'capability-contract', 'installation-manifest',
    'project-profile', 'routing-matrix', 'tool-inventory', 'top-models', 'flow-ledger',
  ];
  for (const name of names) {
    const id = schema(name).$id;
    assert.ok(id, `${name}.schema.json has no $id`);
    assert.ok(
      id.endsWith(`/schemas/${name}.schema.json`),
      `${name}.schema.json $id does not end in its own filename: ${id}`,
    );
    assert.ok(id.includes('llm-orchestrator'), `${name}.schema.json $id does not name this package: ${id}`);
  }
});

test('agent-roles.json validates against its schema', () => {
  assert.deepEqual(validate(schema('agent-roles'), readJson('registries/agent-roles.json')), []);
});

test('the agent-roles schema rejects a role without a charter, a partial charter or a malformed tool capability', () => {
  const mutated = (mutate) => {
    const registry = readJson('registries/agent-roles.json');
    mutate(registry.roles.find(({ id }) => id === 'db-migration-author'));
    return validate(schema('agent-roles'), registry);
  };
  assert.ok(mutated((role) => { delete role.charter; }).some((error) => /missing required key charter/.test(error)), 'a removed charter must fail validation');
  assert.ok(mutated((role) => { delete role.charter.handoff; }).some((error) => /charter: missing required key handoff/.test(error)), 'a charter without handoff must fail validation');
  assert.ok(mutated((role) => { delete role.best_for; }).some((error) => /missing required key best_for/.test(error)), 'a removed best_for must fail validation');
  assert.ok(mutated((role) => { role.tool_capabilities = [{ capability: 'database.schema_provenance' }]; }).some((error) => /missing required key label/.test(error)), 'a tool capability needs a label');
  assert.ok(mutated((role) => { role.tool_capabilities = [{ capability: 'x', label: 'y', server: 'db-client' }]; }).some((error) => /unexpected key server/.test(error)), 'a tool capability names no server');
});

test('discovered project profiles validate against the project-profile schema', async () => {
  // Every fixture, because `bindings` is null for all but one of them and the
  // schema previously only accepted an object.
  for (const fixture of ['web-monorepo', 'python-service', 'mobile-app', 'with-bindings', 'empty']) {
    const profile = await discoverProject({ root: join(root, 'fixtures', 'discovery', fixture) });
    assert.deepEqual(
      validate(schema('project-profile'), profile),
      [],
      `fixtures/discovery/${fixture} produced a profile the schema rejects`,
    );
  }
});

test('a discovered tool inventory validates against the tool-inventory schema', async () => {
  const inventory = await discoverTools({
    harness: 'codex',
    runtimeInventory: {
      session: 'session-schema-test',
      entries: [
        {
          id: 'context7',
          kind: 'mcp',
          capabilities: ['docs.current'],
          scope: 'user',
          source: 'active runtime tool schema',
          status: 'callable',
          permission: 'read_only',
          evidence: 'listed by the running session',
        },
      ],
    },
  });
  assert.deepEqual(validate(schema('tool-inventory'), inventory), []);
});

test('a real installation manifest validates against the installation-manifest schema', async () => {
  const base = await mkdtemp(join(tmpdir(), 'llm-orchestrator-schema-'));
  const project = join(base, 'app');
  await cp(join(root, 'fixtures', 'discovery', 'web-monorepo'), project, { recursive: true });

  // All four harnesses plus --with-agents, so the manifest contains every file
  // scope and kind the installer can emit, not just the Codex subset.
  execFileSync(process.execPath, [
    join(root, 'bin', 'llm-orchestrator.mjs'), 'install',
    '--project', project,
    '--harness', 'codex,claude,opencode,kilo',
    '--skills-root', join(base, 'skills'),
    '--state-root', join(base, 'state'),
    '--codex-prompts-root', join(base, 'prompts'),
    '--with-agents', '--apply',
  ], { env: { ...process.env, HOME: base, XDG_STATE_HOME: join(base, 'state') }, stdio: 'pipe' });

  const found = execFileSync('find', [join(base, 'state'), '-name', 'installation-manifest.json'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  assert.ok(found.length > 0, 'install --apply wrote no installation manifest');

  for (const path of found) {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(validate(schema('installation-manifest'), manifest), [], `${path} does not match its schema`);
  }
});

test('a real flow ledger — session file and history lines — validates against flow-ledger', async () => {
  const project = await mkdtemp(join(tmpdir(), 'llm-orchestrator-ledger-'));
  await writeFile(join(project, 'AGENTS.md'), 'uses orchestrate-core\n');
  const ledger = schema('flow-ledger');
  const send = (payload) => handleHook({ payload: { session_id: 'sess-1', ...payload }, project });
  await send({ hook_event_name: 'UserPromptSubmit', prompt_id: 'p1' });
  await send({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'grep x' }, tool_use_id: 't1' });
  await send({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'llm-orchestrator run start --type BUG_FIX --shards 2' }, tool_use_id: 't2' });
  await send({ hook_event_name: 'SubagentStart', agent_id: 'a1' });
  const session = JSON.parse(await readFile(join(project, '.orchestrator-run', 'sessions', 'sess-1.json'), 'utf8'));
  assert.deepEqual(validate({ ...ledger.$defs.session, $defs: ledger.$defs }, session), []);
  assert.deepEqual(validate(ledger.$defs.run, session.run), []);
  await send({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'llm-orchestrator run close' }, tool_use_id: 't3' });
  await send({ hook_event_name: 'UserPromptSubmit', prompt_id: 'p2' });
  await send({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/x' }, tool_use_id: 't4' });
  await send({ hook_event_name: 'UserPromptSubmit', prompt_id: 'p3' });
  const lines = (await readFile(join(project, '.orchestrator-run', 'history.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  for (const line of lines) assert.deepEqual(validate(ledger.$defs.historyLine, line), []);
});

test('the shared validator enforces the string and array bounds the schemas declare', () => {
  const schema = {type: 'object', properties: {
    id: {type: 'string', pattern: '^[a-z-]+$', minLength: 2, maxLength: 5},
    list: {type: 'array', maxItems: 1, items: {type: 'string'}},
  }};
  assert.deepEqual(validate(schema, {id: 'ab', list: ['x']}), []);
  assert.deepEqual(validate(schema, {id: 'A', list: ['x', 'y']}), [
    '$.id: "A" does not match pattern ^[a-z-]+$',
    '$.id: length 1 < minLength 2',
    '$.list: 2 items > maxItems 1',
  ]);
  assert.deepEqual(validate(schema, {id: 'abcdef'}), ['$.id: length 6 > maxLength 5']);
});
