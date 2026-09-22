// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cli = join(repoRoot, 'bin', 'llm-orchestrator.mjs');

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('no subcommand prints help and exits 0', () => {
  const { status, stdout } = run([]);
  assert.equal(status, 0);
  assert.match(stdout, /llm-orchestrator <install\|uninstall\|doctor\|render\|route\|check\|init\|help>/);
});

for (const flag of ['help', '-h', '--help']) {
  test(`"${flag}" prints help and exits 0`, () => {
    const { status, stdout } = run([flag]);
    assert.equal(status, 0);
    assert.match(stdout, /install\s+Install the orchestration core/);
  });
}

test('an unknown subcommand exits 1 and prints the help', () => {
  const { status, stderr } = run(['not-a-real-subcommand']);
  assert.equal(status, 1);
  assert.match(stderr, /Unknown subcommand: not-a-real-subcommand/);
  assert.match(stderr, /llm-orchestrator <install\|uninstall\|doctor\|render\|route\|check\|init\|help>/);
});

test('check passes against this package\'s own tree', () => {
  const { status, stdout } = run(['check']);
  assert.equal(status, 0, stdout);
  assert.match(stdout, /Attribution check: \d+ file\(s\) OK\./);
});

test('route forwards to bin/route.mjs when present, or reports unavailable otherwise', () => {
  const { status, stdout, stderr } = run(['route', '--help']);
  if (status === 1 && /route: not available in this build/.test(stderr)) return; // bin/route.mjs not shipped yet
  assert.equal(status, 0, stderr);
  assert.match(stdout, /Usage: route\.mjs/);
});

test('install --help forwards to the install subcommand usage', () => {
  const { status, stdout } = run(['install', '--help']);
  assert.equal(status, 0);
  assert.match(stdout, /Usage: .*--project ROOT --harness/);
});

test('doctor without --project fails with a usage message, not a stack trace', () => {
  const { status, stderr } = run(['doctor', '--harness', 'codex']);
  assert.equal(status, 2);
  assert.match(stderr, /Usage: doctor/);
});

test('init --help prints usage and exits 0', () => {
  const { status, stdout } = run(['init', '--help']);
  assert.equal(status, 0);
  assert.match(stdout, /Usage: llm-orchestrator init --project ROOT/);
});

test('init without --project fails with a usage message', () => {
  const { status, stderr } = run(['init']);
  assert.equal(status, 1);
  assert.match(stderr, /Usage: llm-orchestrator init --project ROOT/);
});
