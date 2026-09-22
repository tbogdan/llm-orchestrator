import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {buildAvailableReport, buildReport, calculateIndices} from '../../bin/model-thinking-report.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const data = JSON.parse(readFileSync(path.join(root, 'models/model-thinking-data.json'), 'utf8'));

test('uses Sol medium as the fixed cost-index baseline', () => {
  const row = calculateIndices({cost_usd: 0.5, input_usd_per_mtok: 4, output_usd_per_mtok: 20});
  assert.deepEqual(row, {benchmark_cost_index: 100, token_basket_index: 100});
});

test('keeps missing benchmark measurements missing', () => {
  const row = calculateIndices({cost_usd: null, input_usd_per_mtok: 1, output_usd_per_mtok: 5});
  assert.equal(row.benchmark_cost_index, null);
  assert.equal(row.token_basket_index, 25);
  assert.match(buildReport(data), /claude-4-5-haiku \| Claude Haiku 4.5 \| disabled \| — \| —/);
});

test('labels equal displayed scores without claiming they are identical', () => {
  const report = buildReport(data);
  assert.match(report, /claude-fable-5-1 \| Claude Fable 5.1 \| max \| 53 \| \$7.63 \| 1526 \| 250 \| \+\$1.65 \(1.28×\); no measured gain at displayed precision/);
});

test('report generation is deterministic and check accepts the checked-in output', () => {
  assert.equal(buildReport(data), buildReport(data));
  execFileSync(process.execPath, ['bin/model-thinking-report.mjs', '--check'], {cwd: root, stdio: 'pipe'});
});

test('availability filtering requires exact provider, ID, and explicitly exposed effort', () => {
  const inventory = {
    schema_version: 1, harness: 'Codex', observed_at: new Date().toISOString(), source: 'test', status: 'available', limitations: [],
    models: [
      {id: 'gpt-5.6-luna', provider: 'openai', efforts: ['medium'], availability: 'exposed', source: 'test'},
      {id: 'gpt-5.6-sol', provider: 'anthropic', efforts: ['high'], availability: 'verified', source: 'test'},
      {id: 'gpt-5.5', provider: 'openai', efforts: ['high'], availability: 'exposed', source: 'test'},
      {id: 'gpt-6-astra', provider: 'openai', efforts: ['opaque'], availability: 'exposed', source: 'test'},
      {id: 'claude-opus-5', provider: 'anthropic', efforts: ['high'], availability: 'configured', source: 'test'},
      {id: 'mystery-1', provider: 'google', efforts: ['default'], availability: 'exposed', source: 'test'}
    ]
  };
  const report = buildAvailableReport(data, inventory, new Date());
  assert.match(report, /GPT-5.6 Luna \| `gpt-5.6-luna` \| medium \| 25/);
  assert.doesNotMatch(report, /GPT-5.6 Sol \| `gpt-5.6-sol`/);
  assert.match(report, /gpt-5.5 \| openai \| high \| no AA v4.3.2 dataset row/);
  assert.match(report, /gpt-6-astra \| opaque \| no AA v4.3.2 measurement for explicitly exposed effort/);
  assert.match(report, /claude-opus-5 \| configured only/);
  assert.match(report, /mystery-1 \| google \| default \| no AA v4.3.2 dataset row/);
});

test('available output is stdout-only and never overwrites the universal report', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'model-thinking-'));
  const inventoryPath = path.join(directory, 'inventory.json');
  const before = readFileSync(path.join(root, 'models/model-thinking-matrix.md'), 'utf8');
  writeFileSync(inventoryPath, JSON.stringify({schema_version: 1, harness: 'Codex', observed_at: new Date().toISOString(), source: 'test', status: 'available', limitations: [], models: []}));
  try {
    const stdout = execFileSync(process.execPath, ['bin/model-thinking-report.mjs', '--available', inventoryPath], {cwd: root, encoding: 'utf8'});
    assert.match(stdout, /Availability comparison/);
    assert.equal(readFileSync(path.join(root, 'models/model-thinking-matrix.md'), 'utf8'), before);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('rejects non-normalized inventory status and blocks unknown or unavailable snapshots', () => {
  const base = {schema_version: 1, harness: 'Codex', observed_at: new Date().toISOString(), source: 'test', limitations: [], models: [{id: 'gpt-5.6-luna', provider: 'openai', efforts: ['low'], availability: 'exposed', source: 'test'}]};
  assert.throws(() => buildAvailableReport(data, {...base, status: 'ok'}), /Invalid availability inventory schema/);
  assert.throws(() => buildAvailableReport(data, {...base, status: 'available', observed_at: null}), /observed_at must be an ISO timestamp/);
  for (const status of ['unknown', 'unavailable']) {
    const report = buildAvailableReport(data, {...base, status});
    assert.doesNotMatch(report, /\| GPT-5.6 Luna \|/);
    assert.match(report, new RegExp(`snapshot status ${status}`));
  }
  const unavailableModel = buildAvailableReport(data, {...base, status: 'available', models: [{...base.models[0], availability: 'unavailable'}]});
  assert.doesNotMatch(unavailableModel, /\| GPT-5.6 Luna \|/);
});

test('accepts the checked-in Codex availability inventory', () => {
  const stdout = execFileSync(process.execPath, ['bin/model-thinking-report.mjs', '--available', 'models/example-model-inventory.json'], {cwd: root, encoding: 'utf8'});
  assert.match(stdout, /Availability comparison — runtime snapshot/);
  assert.match(stdout, /GPT-5.6 Luna \| `gpt-5.6-luna` \| low \| 21/);
  assert.match(stdout, /gpt-5.5 \| openai \| low, medium, high, xhigh \| no AA v4.3.2 dataset row/);
});
