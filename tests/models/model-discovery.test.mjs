import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';

const script = new URL('../../bin/discover-models.mjs', import.meta.url);

function run(args, environment = {}) {
  return spawnSync(process.execPath, [script.pathname, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
}

function runAsync(args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script.pathname, ...args], {
      env: { ...process.env, ...environment },
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
}

async function withTempDirectory(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'events-model-discovery-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function snapshot(overrides = {}) {
  return {
    schema_version: 1,
    harness: 'codex',
    observed_at: '2026-09-22T10:00:00.000Z',
    source: 'active-session-picker',
    status: 'available',
    models: [{
      id: 'gpt-5.6-terra',
      provider: 'openai',
      efforts: ['medium'],
      availability: 'exposed',
      source: 'active-session-picker',
    }],
    limitations: [],
    ...overrides,
  };
}

test('deduplicates models by retaining the strongest evidence record intact', async () => {
  await withTempDirectory(async (directory) => {
    const input = join(directory, 'snapshot.json');
    const output = join(directory, 'result.json');
    await writeFile(input, JSON.stringify(snapshot({
      models: [
        ...snapshot().models,
        { id: 'gpt-5.6-terra', provider: 'openai', efforts: ['high'], availability: 'verified', source: 'runtime-inventory' },
      ],
    })));

    const result = run(['--harness', 'codex', '--input', input, '--output', output]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), snapshot({
      models: [{
        id: 'gpt-5.6-terra',
        provider: 'openai',
        efforts: ['high'],
        availability: 'verified',
        source: 'runtime-inventory',
      }],
    }));
  });
});

test('rejects equal-strength duplicate model records with conflicting provenance', async () => {
  await withTempDirectory(async (directory) => {
    const input = join(directory, 'snapshot.json');
    await writeFile(input, JSON.stringify(snapshot({
      models: [
        ...snapshot().models,
        { id: 'gpt-5.6-terra', provider: 'openai', efforts: ['high'], availability: 'exposed', source: 'tool-inventory' },
      ],
    })));

    const result = run(['--harness', 'codex', '--input', input]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /equal-strength/i);
  });
});

test('rejects an input snapshot for another harness', async () => {
  await withTempDirectory(async (directory) => {
    const input = join(directory, 'snapshot.json');
    await writeFile(input, JSON.stringify(snapshot({ harness: 'claude' })));

    const result = run(['--harness', 'codex', '--input', input]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /harness/i);
  });
});

test('rejects an unsupported harness before performing discovery', () => {
  const result = run(['--harness', 'unlisted-runtime']);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /supported --harness/i);
});

test('rejects arbitrary fields that could forward a secret', async () => {
  await withTempDirectory(async (directory) => {
    const input = join(directory, 'snapshot.json');
    await writeFile(input, JSON.stringify(snapshot({ api_key: 'sk-not-forwarded' })));

    const result = run(['--harness', 'codex', '--input', input]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unexpected field/i);
    assert.doesNotMatch(result.stdout + result.stderr, /sk-not-forwarded/);
  });
});

test('preserves an empty effort list as unknown rather than inferring every effort', async () => {
  await withTempDirectory(async (directory) => {
    const input = join(directory, 'snapshot.json');
    await writeFile(input, JSON.stringify(snapshot({
      models: [{
        id: 'gpt-5.6-luna',
        provider: 'openai',
        efforts: [],
        availability: 'configured',
        source: 'active-session-picker',
      }],
    })));

    const result = run(['--harness', 'codex', '--input', input]);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).models[0].efforts, []);
  });
});

test('rejects a status that conflicts with its model evidence', async () => {
  await withTempDirectory(async (directory) => {
    const unavailable = join(directory, 'unavailable.json');
    const emptyAvailable = join(directory, 'empty-available.json');
    await writeFile(unavailable, JSON.stringify(snapshot({ status: 'unavailable' })));
    await writeFile(emptyAvailable, JSON.stringify(snapshot({ models: [] })));

    const unavailableResult = run(['--harness', 'codex', '--input', unavailable]);
    const emptyAvailableResult = run(['--harness', 'codex', '--input', emptyAvailable]);

    assert.notEqual(unavailableResult.status, 0);
    assert.match(unavailableResult.stderr, /unavailable.*models/i);
    assert.notEqual(emptyAvailableResult.status, 0);
    assert.match(emptyAvailableResult.stderr, /available.*model/i);
  });
});

test('rejects non-RFC3339 timestamps and snapshots above the model limit', async () => {
  await withTempDirectory(async (directory) => {
    const badTimestamp = join(directory, 'timestamp.json');
    const tooManyModels = join(directory, 'models.json');
    await writeFile(badTimestamp, JSON.stringify(snapshot({ observed_at: '2026-09-22' })));
    await writeFile(tooManyModels, JSON.stringify(snapshot({
      models: Array.from({ length: 513 }, (_, index) => ({
        id: `model-${index}`,
        provider: 'openai',
        efforts: [],
        availability: 'exposed',
        source: 'active-session-picker',
      })),
    })));

    const timestampResult = run(['--harness', 'codex', '--input', badTimestamp]);
    const modelsResult = run(['--harness', 'codex', '--input', tooManyModels]);

    assert.notEqual(timestampResult.status, 0);
    assert.match(timestampResult.stderr, /RFC3339/i);
    assert.notEqual(modelsResult.status, 0);
    assert.match(modelsResult.stderr, /model limit/i);
  });
});

test('returns unavailable for native OpenCode discovery when no executable is on PATH', () => {
  const result = run(['--harness', 'opencode', '--native'], { PATH: '' });

  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.status, 'unavailable');
  assert.deepEqual(inventory.models, []);
  assert.match(inventory.limitations.join(' '), /not found/i);
});

test('does not expose bare native OpenCode catalog identifiers as selectable models', async () => {
  await withTempDirectory(async (directory) => {
    const executable = join(directory, 'opencode');
    await writeFile(executable, '#!/bin/sh\nif [ "$2" = "--help" ]; then exit 0; fi\nprintf "public-provider/public-model\\n"\n');
    await chmod(executable, 0o700);

    const result = run(['--harness', 'opencode', '--native'], { PATH: directory });

    assert.equal(result.status, 0, result.stderr);
    const inventory = JSON.parse(result.stdout);
    assert.equal(inventory.status, 'unknown');
    assert.deepEqual(inventory.models, []);
    assert.match(inventory.limitations.join(' '), /does not prove/i);
  });
});

test('preserves an existing output and rejects a second publication', async () => {
  await withTempDirectory(async (directory) => {
    const output = join(directory, 'inventory.json');
    const existing = '{"existing":true}\n';
    await writeFile(output, existing);

    const result = run(['--harness', 'codex', '--output', output]);

    assert.notEqual(result.status, 0);
    assert.equal(await readFile(output, 'utf8'), existing);
  });
});

test('allows only one concurrent publication to a new output path', async () => {
  await withTempDirectory(async (directory) => {
    const output = join(directory, 'inventory.json');
    const results = await Promise.all([
      runAsync(['--harness', 'codex', '--output', output]),
      runAsync(['--harness', 'codex', '--output', output]),
    ]);

    assert.equal(results.filter((code) => code === 0).length, 1);
    assert.equal(JSON.parse(await readFile(output, 'utf8')).harness, 'codex');
  });
});

test('rejects a nonregular input path', async () => {
  await withTempDirectory(async (directory) => {
    const result = run(['--harness', 'codex', '--input', directory]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /regular file/i);
  });
});

test('rejects a FIFO without blocking before the regular-file check', { skip: process.platform === 'win32' }, async () => {
  await withTempDirectory(async (directory) => {
    const fifo = join(directory, 'snapshot.fifo');
    const creation = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
    assert.equal(creation.status, 0, creation.stderr);

    const result = run(['--harness', 'codex', '--input', fifo]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /regular file/i);
  });
});

test('rejects an input file above the byte limit before parsing it', async () => {
  await withTempDirectory(async (directory) => {
    const input = join(directory, 'oversized.json');
    await writeFile(input, ' '.repeat(1024 * 1024 + 1));

    const result = run(['--harness', 'codex', '--input', input]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /byte limit/i);
  });
});

test('fails closed when native discovery is requested for a harness without a supported native listing', () => {
  const result = run(['--harness', 'kilo', '--native']);

  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.status, 'unknown');
  assert.deepEqual(inventory.models, []);
  assert.match(inventory.limitations.join(' '), /snapshot/i);
});
