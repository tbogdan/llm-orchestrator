// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;
const scriptPath = join(root, 'bin/attribution-check.mjs');

function makeFixtureRoot() {
  const directory = mkdtempSync(join(tmpdir(), 'attribution-check-'));
  mkdirSync(join(directory, 'lib'), { recursive: true });
  return directory;
}

test('attribution check passes on the committed owned files', async () => {
  const { stdout } = await execFileAsync(process.execPath, [scriptPath]);
  assert.match(stdout, /^Attribution check: \d+ file\(s\) OK\.$/m);
});

test('attribution check reports a missing marker and exits non-zero', async () => {
  const directory = makeFixtureRoot();
  try {
    writeFileSync(join(directory, 'lib', 'no-marker.mjs'), 'export const x = 1;\n');
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath, '--root', directory]),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('--fix inserts the correct marker for .mjs (plain and shebang), .md (plain and frontmattered), and .json', async () => {
  const directory = makeFixtureRoot();
  try {
    writeFileSync(join(directory, 'lib', 'plain.mjs'), 'export const x = 1;\n');
    writeFileSync(join(directory, 'lib', 'shebang.mjs'), '#!/usr/bin/env node\nconsole.log("hi");\n');
    writeFileSync(join(directory, 'README.md'), '# Title\n\nBody text.\n');
    writeFileSync(join(directory, 'lib', 'frontmattered.md'), '---\nname: x\n---\n\n# Title\n');
    writeFileSync(join(directory, 'lib', 'data.json'), JSON.stringify({ version: 1 }));

    await execFileAsync(process.execPath, [scriptPath, '--root', directory, '--fix']);

    const plain = readFileSync(join(directory, 'lib', 'plain.mjs'), 'utf8');
    assert.match(plain.split('\n')[0], /^\/\/ llm-orchestrator/);

    const shebang = readFileSync(join(directory, 'lib', 'shebang.mjs'), 'utf8');
    const shebangLines = shebang.split('\n');
    assert.equal(shebangLines[0], '#!/usr/bin/env node');
    assert.match(shebangLines[1], /^\/\/ llm-orchestrator/);

    const readme = readFileSync(join(directory, 'README.md'), 'utf8');
    assert.match(readme.split('\n')[0], /^<!-- llm-orchestrator/);

    const frontmattered = readFileSync(join(directory, 'lib', 'frontmattered.md'), 'utf8');
    const fmLines = frontmattered.split('\n');
    assert.equal(fmLines[0], '---');
    assert.equal(fmLines[1], 'name: x');
    assert.equal(fmLines[2], '---');
    assert.match(fmLines[3], /^<!-- llm-orchestrator/);

    const data = JSON.parse(readFileSync(join(directory, 'lib', 'data.json'), 'utf8'));
    assert.match(data._attribution, /^llm-orchestrator/);
    assert.equal(data.version, 1);

    const { stdout } = await execFileAsync(process.execPath, [scriptPath, '--root', directory]);
    assert.match(stdout, /OK\./);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
