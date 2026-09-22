// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
/**
 * Mechanical coherence checks. Each test maps to one cross-reference class in
 * docs/COHERENCE.md, and fails when a name drifts between its source of truth
 * and any file that restates it.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { SHARD_ROUTING_FIELDS } from '../lib/dispatch-contract.mjs';
import { TASK_TYPES } from '../lib/router.mjs';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (relative) => readFileSync(root + relative, 'utf8');
const json = (relative) => JSON.parse(read(relative));

const policyFiles = readdirSync(root + 'policies').filter((name) => name.endsWith('.md'));
const workflowFiles = readdirSync(root + 'workflows').filter((name) => name.endsWith('.md'));

// ---------------------------------------------------------------- class 1
test('coherence 1: dispatch-contract field names are identical everywhere they are named', () => {
  const protocolText = read('protocol.md');
  const dispatchText = read('policies/dispatch.md');
  const schema = json('schemas/capability-contract.schema.json');
  const contractSchema = schema.$defs.dispatchContract.properties;
  const reportSchema = schema.$defs.dispatchEvidenceReport.properties;

  const contractFields = [
    'required_mcps', 'required_skills', 'required_workflows', 'required_cli_tools',
    'available_tools', 'permission_profile', 'rtk_preflight', 'fallback_plan', 'inventory_revision',
  ];
  for (const field of contractFields) {
    assert.ok(protocolText.includes(field) || field === 'inventory_revision', `protocol.md is missing ${field}`);
    assert.ok(dispatchText.includes(`\`${field}\``), `policies/dispatch.md is missing \`${field}\``);
    assert.ok(field in contractSchema, `capability-contract.schema.json dispatchContract is missing ${field}`);
  }

  // Fields the contract adds beyond the pre-evaluation object.
  for (const field of ['degraded', 'restart_count', 'max_iterations', 'routing']) {
    assert.ok(dispatchText.includes(`\`${field}\``), `policies/dispatch.md is missing \`${field}\``);
  }
  assert.ok('routing' in contractSchema, 'schema dispatchContract is missing routing');

  // `used_mcps` is named in protocol.md and dispatch.md, so it must exist in the report schema.
  assert.ok(protocolText.includes('used_mcps'), 'protocol.md is missing used_mcps');
  assert.ok(dispatchText.includes('used_mcps'), 'policies/dispatch.md is missing used_mcps');
  assert.ok('used_mcps' in reportSchema, 'dispatchEvidenceReport is missing used_mcps');

  // Every pre-evaluation key is either a contract field or an explicitly documented flow field.
  const preEvaluation = protocolText.slice(protocolText.indexOf('```json'), protocolText.indexOf('```', protocolText.indexOf('```json') + 3));
  for (const field of ['required_workflows', 'required_cli_tools', 'permission_profile', 'rtk_preflight', 'fallback_plan', 'degraded', 'used_mcps', 'open_questions']) {
    assert.ok(preEvaluation.includes(`"${field}"`), `pre-evaluation JSON is missing "${field}"`);
  }
});

test('coherence 1b: the PlanShard routing block uses the same thirteen names everywhere', () => {
  assert.equal(SHARD_ROUTING_FIELDS.length, 13);
  const sources = {
    'policies/dispatch.md': read('policies/dispatch.md'),
    'policies/routing.md': read('policies/routing.md'),
    'protocol.md': read('protocol.md'),
    'SKILL.md': read('SKILL.md'),
    // Template literals escape their backticks; normalize so the same check applies.
    'adapters/commands.mjs': read('adapters/commands.mjs').replaceAll('\\`', '`'),
  };
  for (const field of SHARD_ROUTING_FIELDS) {
    for (const [name, text] of Object.entries(sources)) {
      assert.ok(text.includes(`\`${field}\``), `${name} does not name the routing field \`${field}\``);
    }
  }
  const routingDef = json('schemas/capability-contract.schema.json').$defs.shardRouting;
  assert.deepEqual([...routingDef.required].sort(), [...SHARD_ROUTING_FIELDS].sort());

  // policies/routing.md "Dispatch metadata" lists exactly these fields as its table rows.
  const routingText = sources['policies/routing.md'];
  const section = routingText.slice(routingText.indexOf('## Dispatch metadata'), routingText.indexOf('## Cost discipline'));
  const rows = [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map((match) => match[1]);
  assert.deepEqual(rows, SHARD_ROUTING_FIELDS, 'the Dispatch metadata table must list exactly the routing fields, in order');
});

// ---------------------------------------------------------------- class 2
test('coherence 2: drawer and flow-flag names are identical across policies, protocol and prompts', () => {
  const stateText = read('policies/state.md');
  const drawers = ['task:', 'flow:', 'gate:', 'evidence:', 'hypothesis:', 'ownership:', 'regression:', 'review:', 'runbook:', 'verification:', 'cleanup:', 'permission_recovery:'];
  for (const drawer of drawers) {
    assert.ok(stateText.includes(`\`${drawer}`), `policies/state.md does not define the \`${drawer}\` drawer`);
  }

  const flags = ['permission_recovery_pending', 'permission_blocked', 'subagent_stream_recovery_pending', 'subagent_resume_unavailable', 'cleanup_state', 'open_questions'];
  for (const flag of flags) {
    assert.ok(stateText.includes(`\`${flag}\``), `policies/state.md does not list the \`${flag}\` flow flag`);
  }

  // Every use elsewhere must be one of the documented names, not a variant.
  const users = {
    'policies/dispatch.md': read('policies/dispatch.md'),
    'policies/cleanup.md': read('policies/cleanup.md'),
    'protocol.md': read('protocol.md'),
    'adapters/commands.mjs': read('adapters/commands.mjs'),
  };
  const known = new Set([...drawers.map((d) => d.slice(0, -1)), ...flags]);
  for (const [name, text] of Object.entries(users)) {
    for (const match of text.matchAll(/`([a-z_]+):\{task_id\}/g)) {
      assert.ok(known.has(match[1]), `${name} uses undocumented drawer \`${match[1]}:\``);
    }
  }
  assert.ok(users['policies/dispatch.md'].includes('permission_recovery:{task_id}:{phase}:{role}'));
  assert.ok(users['policies/cleanup.md'].includes('cleanup_state'));
});

// ---------------------------------------------------------------- class 3
const MANDATORY_EIGHT = [
  { id: 'orchestration.bootstrap', tool: 'using-superpowers' },
  { id: 'memory.recall', tool: 'mempalace' },
  { id: 'memory.checkpoint', tool: 'mempalace' },
  { id: 'reasoning.checkpoints', tool: 'sequential' },
  { id: 'communication.concise', tool: 'caveman' },
  { id: 'shell.rtk', tool: 'rtk' },
  { id: 'docs.current', tool: 'context7' },
  { id: 'research.retrieve', tool: 'exa' },
];

test('coherence 3: the 8 mandatory core tools are the same eight, in the same order, in six places', () => {
  const profile = json('registries/core-profile.json').requirements
    .filter((entry) => entry.level === 'mandatory' && typeof entry.order === 'number' && entry.order <= 8)
    .sort((a, b) => a.order - b.order);
  assert.deepEqual(profile.map((entry) => entry.id), MANDATORY_EIGHT.map((entry) => entry.id), 'core-profile.json orders 1-8 drifted');

  const firstRun = read('lib/first-run.mjs');
  const checked = [...firstRun.matchAll(/\{ id: '([a-z.]+)', tool: '([^']+)'/g)].map((match) => ({ id: match[1], tool: match[2] }));
  assert.deepEqual(checked.slice(0, 8).map((entry) => entry.id), MANDATORY_EIGHT.map((entry) => entry.id), 'lib/first-run.mjs checkMandatoryTools drifted');

  const ordered = (text, label) => {
    let cursor = -1;
    for (const entry of MANDATORY_EIGHT) {
      const next = text.indexOf(entry.tool, cursor + 1);
      assert.ok(next > cursor, `${label} does not mention ${entry.tool} after the previous mandatory tool`);
      cursor = next;
    }
  };
  ordered(read('SKILL.md').slice(read('SKILL.md').indexOf('## Mandatory core tools')), 'SKILL.md');
  ordered(read('policies/capabilities.md').slice(read('policies/capabilities.md').indexOf('## Mandatory on every task')), 'policies/capabilities.md');
  ordered(read('adapters/commands.mjs').slice(read('adapters/commands.mjs').indexOf('MANDATORY_CHECKLIST')), 'adapters/commands.mjs');
  ordered(read('README.md').slice(read('README.md').indexOf('### The 8 mandatory core tools')), 'README.md');

  // SKILL.md and capabilities.md name the capability ids too.
  for (const entry of MANDATORY_EIGHT) {
    assert.ok(read('SKILL.md').includes(`\`${entry.id}\``), `SKILL.md is missing the capability id ${entry.id}`);
    assert.ok(read('policies/capabilities.md').includes(`\`${entry.id}\``), `policies/capabilities.md is missing the capability id ${entry.id}`);
  }
});

test('coherence 3b: user.native_question is a registered, mandatory, documented capability', () => {
  assert.ok(json('registries/capabilities.json').capabilities.some((entry) => entry.id === 'user.native_question'));
  const requirement = json('registries/core-profile.json').requirements.find((entry) => entry.id === 'user.native_question');
  assert.equal(requirement?.level, 'mandatory');
  assert.deepEqual(Object.keys(requirement.harness_mechanisms).sort(), ['claude', 'codex', 'kilo', 'opencode']);
  assert.ok(existsSync(root + 'policies/questions.md'));
});

// ---------------------------------------------------------------- class 4
test('coherence 4: the nine task types are identical across protocol, registries, workflows and the CLI', async () => {
  const mapping = json('registries/task-mappings.json').task_types;
  assert.deepEqual(mapping.map((entry) => entry.type).sort(), [...TASK_TYPES].sort());

  const protocolText = read('protocol.md');
  const matrix = json('registries/routing-matrix.json');
  for (const entry of mapping) {
    assert.ok(protocolText.includes(`**${entry.type}**`), `protocol.md classification table is missing ${entry.type}`);
    assert.ok(matrix.task_flows[entry.type], `routing-matrix.json task_flows is missing ${entry.type}`);
    assert.ok(workflowFiles.includes(entry.workflow.replace('workflows/', '')), `${entry.workflow} does not exist`);
  }
  assert.ok(mapping.some((entry) => entry.type === 'RESEARCH'), 'RESEARCH must be present everywhere');

  const { stdout } = await execFileAsync(process.execPath, [root + 'bin/route.mjs', '--list']);
  for (const entry of mapping) assert.ok(stdout.includes(`  ${entry.type}:`), `route.mjs --list is missing ${entry.type}`);

  // Every lowercase id used by task-mappings rules is one of the declared ids.
  const ids = new Set(mapping.map((entry) => entry.id));
  const extraIds = new Set(['documentation', 'harness', 'skill', 'bug', 'deployment']);
  for (const rule of json('registries/task-mappings.json').mappings) {
    for (const value of rule.when?.any_task_types ?? []) {
      assert.ok(ids.has(value) || extraIds.has(value), `task-mappings rule ${rule.id} uses unknown task id ${value}`);
    }
  }
});

// ---------------------------------------------------------------- class 5
test('coherence 5: agent role ids are identical across registries, routing prose and the renderer', () => {
  const roles = json('registries/agent-roles.json').roles.map((role) => role.id);
  const ids = new Set(roles);
  const matrix = json('registries/routing-matrix.json');

  assert.deepEqual(Object.keys(matrix.agent_defaults).sort(), [...roles].sort(), 'routing-matrix agent_defaults and agent-roles roles drifted');
  for (const flow of Object.values(matrix.task_flows)) {
    for (const phase of flow.phases) {
      for (const role of phase.roles ?? []) assert.ok(ids.has(role), `routing-matrix task_flows names unknown role ${role}`);
    }
  }
  for (const role of Object.keys(matrix.agent_default_notes ?? {})) assert.ok(ids.has(role), `agent_default_notes names unknown role ${role}`);

  const routingText = read('policies/routing.md');
  const agentSection = routingText.slice(routingText.indexOf('## Agent defaults'), routingText.indexOf('## Flow matrix'));
  for (const role of ['explore', 'route-data-flow-tracer', 'production-telemetry-collector', 'test-engineer', 'code-simplifier', 'backend-fixer', 'frontend-fixer', 'code-reviewer', 'general', 'db-migration-author', 'adversarial-skeptic', 'frontend-specialist', 'db-concurrency-specialist', 'provider-webhook-specialist', 'orchestrator']) {
    assert.ok(ids.has(role), `policies/routing.md Agent defaults names unknown role ${role}`);
    assert.ok(agentSection.includes(role), `policies/routing.md Agent defaults is missing ${role}`);
  }

  // Deprecated spellings must not reappear anywhere in the core.
  const deprecated = [/(?<![-\w])telemetry-collector/, /vue-capacitor-frontend-specialist/];
  const scanned = ['SKILL.md', 'protocol.md', ...policyFiles.map((f) => `policies/${f}`), ...workflowFiles.map((f) => `workflows/${f}`), 'registries/agent-roles.json', 'registries/routing-matrix.json', 'registries/task-mappings.json', 'registries/preferred-tools.json', 'adapters/agents.mjs'];
  for (const relative of scanned) {
    for (const pattern of deprecated) assert.doesNotMatch(read(relative), pattern, `${relative} uses a deprecated role spelling`);
  }
});

// ---------------------------------------------------------------- class 6
test('coherence 6: risk-floor areas are one prose row per registry key, same names', () => {
  const floors = json('registries/routing-matrix.json').risk_floors;
  const routingText = read('policies/routing.md');
  const section = routingText.slice(routingText.indexOf('## Risk floors'), routingText.indexOf('## Agent defaults'));
  const rows = [...section.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((match) => match[1]);
  assert.deepEqual(rows, Object.keys(floors), 'the Risk floors table must have one row per registry key, in registry order');
  for (const [area, floor] of Object.entries(floors)) {
    const row = section.split('\n').find((line) => line.startsWith(`| \`${area}\` |`));
    const cells = row.split('|').map((cell) => cell.trim());
    assert.equal(cells[2], floor.implementation.replace('-', '–'), `${area} implementation floor drifted`);
    assert.equal(cells[3], floor.review === null ? '—' : floor.review, `${area} review floor drifted`);
    assert.equal(cells[4], floor.independent_review ? 'yes' : 'no', `${area} independent-review flag drifted`);
  }
});

// ---------------------------------------------------------------- class 7
const GATE_LABELS = [
  '**G0** Plan Approved',
  '**G1** Evidence / Requirements Complete',
  '**G2** Hypothesis / Design Valid',
  '**G3** Test RED',
  '**G4** Build GREEN',
  '**G5** Review PASS',
  '**G6** Verification Complete',
];

test('coherence 7: gate labels G0-G6 are worded identically in protocol, verification and every workflow', () => {
  const protocolText = read('protocol.md');
  for (const label of GATE_LABELS) assert.ok(protocolText.includes(label), `protocol.md is missing the gate label "${label}"`);

  const verificationText = read('policies/verification.md');
  for (const label of GATE_LABELS.slice(3)) assert.ok(verificationText.includes(label), `policies/verification.md is missing "${label}"`);

  for (const file of workflowFiles) {
    const text = read(`workflows/${file}`);
    for (const label of GATE_LABELS) assert.ok(text.includes(label), `workflows/${file} is missing the gate label "${label}"`);
  }
});

// ---------------------------------------------------------------- class 9
test('coherence 9: every CLI flag in README exists in a usage string, and vice versa', async () => {
  const readme = read('README.md');
  const cliOptions = read('bin/cli-options.mjs');
  const routeUsage = read('bin/route.mjs');
  const attribution = read('bin/attribution-check.mjs');
  const unified = read('bin/llm-orchestrator.mjs');
  const modelsDiscover = read('bin/discover-models.mjs');
  const modelsReport = read('bin/model-thinking-report.mjs');
  const usageText = `${cliOptions}\n${routeUsage}\n${attribution}\n${unified}\n${modelsDiscover}\n${modelsReport}`;

  const readmeFlags = new Set([...readme.matchAll(/(?<![\w-])--[a-z][a-z0-9-]+/g)].map((match) => match[0]));
  const ignored = new Set(['--test', '--pure', '--no-data']);
  for (const flag of readmeFlags) {
    if (ignored.has(flag)) continue;
    assert.ok(usageText.includes(flag), `README documents ${flag} but no CLI accepts it`);
  }

  const usageFlags = new Set();
  const modelsHelp = unified.slice(unified.indexOf('const MODELS_HELP'), unified.indexOf('async function forward'));
  for (const source of [cliOptions.slice(cliOptions.indexOf('export function usage')), routeUsage.slice(routeUsage.indexOf('const USAGE'), routeUsage.indexOf('const VALUED')), modelsHelp]) {
    for (const match of source.matchAll(/(?<![\w-])--[a-z][a-z0-9-]+/g)) usageFlags.add(match[0]);
  }
  const undocumented = ['--help'];
  for (const flag of usageFlags) {
    if (undocumented.includes(flag)) continue;
    assert.ok(readme.includes(flag), `CLI accepts ${flag} but the README never documents it`);
  }

  const { stdout } = await execFileAsync(process.execPath, [root + 'bin/llm-orchestrator.mjs', '--help']);
  for (const subcommand of ['install', 'uninstall', 'doctor', 'render', 'route', 'models', 'check', 'init']) {
    assert.ok(stdout.includes(subcommand), `--help does not list ${subcommand}`);
  }
});

// ---------------------------------------------------------------- class 10
test('coherence 10: SKILL.md references every policy file and every referenced policy exists', () => {
  const skill = read('SKILL.md');
  const referenced = new Set([...skill.matchAll(/\(policies\/([a-z-]+\.md)\)/g)].map((match) => match[1]));
  assert.deepEqual([...referenced].sort(), [...policyFiles].sort(), 'SKILL.md policy references and policies/ drifted');

  const table = skill.slice(skill.indexOf('## Which policy to read, when'));
  for (const file of policyFiles) {
    assert.ok(table.includes(`policies/${file}`), `SKILL.md "Which policy to read, when" has no row for ${file}`);
    assert.ok(existsSync(root + `policies/${file}`));
  }
});
