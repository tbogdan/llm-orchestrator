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
import { mkdtemp, readFile, cp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validate } from './schema-validator.mjs';
import { discoverProject } from '../lib/project-discovery.mjs';
import { discoverTools } from '../lib/tool-discovery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(root + path, 'utf8'));
const schema = (name) => readJson(`schemas/${name}.schema.json`);

test('every schema declares an $id that names this package', () => {
  const names = [
    'agent-roles', 'capability-contract', 'installation-manifest',
    'project-profile', 'routing-matrix', 'tool-inventory', 'top-models',
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
