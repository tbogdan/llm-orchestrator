import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);

async function registry(name) {
  return JSON.parse(await readFile(new URL(`registries/${name}.json`, root), 'utf8'));
}

test('registry separates skill, workflow, MCP, CLI, and agent roles', async () => {
  const preferred = await registry('preferred-tools');
  const byId = Object.fromEntries(preferred.tools.map(entry => [entry.id, entry]));

  assert.equal(byId['sequential-thinking'].kind, 'mcp');
  assert.equal(byId['provider-webhook-specialist'].kind, 'agent_role');
  assert.equal(byId.rtk.kind, 'cli');
  assert.equal(byId.playwright.kind, 'mcp');
});

test('task mappings use predicates so inactive project domains stay inactive', async () => {
  const mappings = await registry('task-mappings');
  const pythonUnitFix = mappings.mappings.filter(mapping => mapping.when.any_project_domains?.includes('billing'));
  const androidNative = mappings.mappings.find(mapping => mapping.id === 'mobile-native');

  assert.equal(pythonUnitFix.length > 0, true);
  assert.ok(androidNative.when.any_task_signals.includes('android'));
  assert.ok(androidNative.when.any_task_signals.includes('ios'));
});

test('capability contract schema documents the exact portable task fields', async () => {
  const schema = JSON.parse(await readFile(new URL('schemas/capability-contract.schema.json', root), 'utf8'));
  const task = schema.$defs.task;

  assert.deepEqual(task.required, ['type']);
  assert.ok(task.properties.signals);
  assert.ok(task.properties.requires_shell);
  assert.ok(task.properties.nontrivial);
  assert.ok(task.properties.acceptance);
});

test('capability contract schema includes child evidence and typed legacy projections', async () => {
  const schema = JSON.parse(await readFile(new URL('schemas/capability-contract.schema.json', root), 'utf8'));
  const dispatch = schema.$defs.dispatchContract;
  const report = schema.$defs.dispatchEvidenceReport;

  assert.ok(dispatch.required.includes('required_workflows'));
  assert.ok(dispatch.required.includes('required_cli_tools'));
  assert.ok(dispatch.properties.rtk_preflight);
  assert.ok(report.properties.tool_calls);
  assert.ok(report.properties.acceptance_evidence);
});
