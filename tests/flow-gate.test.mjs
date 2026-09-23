// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { decide, emptySession, normalizePayload, handleHook, adherenceSummary, NUDGE, dispatchNudgeFor } from '../lib/flow-gate.mjs';

const DISPATCH_NUDGE = (n, type) => dispatchNudgeFor('llm-orchestrator', n, type);

const root = fileURLToPath(new URL('../', import.meta.url));
const CLI = join(root, 'bin', 'llm-orchestrator.mjs');
const T0 = Date.parse('2026-09-23T10:00:00Z');

const claude = (event, extra = {}) => normalizePayload({ hook_event_name: event, session_id: 's1', cwd: '/p', ...extra });
const tool = (tool_name, tool_input, extra = {}) => claude('PreToolUse', { tool_name, tool_input, ...extra });
const bash = (command, extra) => tool('Bash', { command }, extra);

function run(events) {
  let session = emptySession('s1');
  const outputs = [];
  const history = [];
  let now = T0;
  for (const event of events) {
    const result = decide(session, event, (now += 1000));
    session = result.session;
    outputs.push(result.output);
    history.push(...result.history);
  }
  return { session, outputs, history };
}

// ------------------------------------------------------------------ nudge
test('a main-thread work tool with no open run gets the nudge, once per prompt', () => {
  const { outputs } = run([claude('UserPromptSubmit'), bash('grep -rn foo src'), bash('ssh prod ls'), tool('Edit', { file_path: '/p/a.js' })]);
  assert.equal(outputs[1]?.additionalContext, NUDGE);
  assert.equal(outputs[2], null, 'second work tool in the same prompt stays quiet');
  assert.equal(outputs[3], null);
});

test('the nudge returns on the next prompt if still no run was opened', () => {
  const { outputs } = run([claude('UserPromptSubmit'), bash('grep x'), claude('UserPromptSubmit'), bash('grep y')]);
  assert.equal(outputs[1]?.additionalContext, NUDGE);
  assert.equal(outputs[3]?.additionalContext, NUDGE);
});

test('reading the orchestration instructions and calling the CLI never trigger the nudge', () => {
  const { outputs } = run([
    claude('UserPromptSubmit'),
    tool('Read', { file_path: '/home/u/.agents/skills/orchestrate-core/SKILL.md' }),
    tool('Read', { file_path: '/p/AGENTS.md' }),
    tool('Read', { file_path: '/home/u/.agents/skills/orchestrate-core/workflows/bug-fix.md' }),
    bash('cat protocol.md'),
    bash('npx llm-orchestrator route --task BUG_FIX'),
    tool('Skill', { skill: 'orchestrate-core' }),
    tool('TodoWrite', { todos: [] }),
    tool('AskUserQuestion', { questions: [] }),
  ]);
  assert.ok(outputs.every((output) => output === null), JSON.stringify(outputs));
});

test('an open run silences the nudge; subagents are never nudged', () => {
  const opened = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type BUG_FIX --shards 3'), bash('grep x'), tool('Edit', { file_path: '/p/a.js' })]);
  assert.ok(opened.outputs.every((output) => output === null));
  assert.equal(opened.session.run.task_type, 'BUG_FIX');
  assert.equal(opened.session.run.planned_shards, 3);

  const sub = run([claude('UserPromptSubmit'), bash('grep x', { agent_id: 'a1', agent_type: 'Explore' })]);
  assert.equal(sub.outputs[1], null);
});

test('a trivial declaration silences the nudge and closes itself at the next prompt', () => {
  const { outputs, history, session } = run([
    claude('UserPromptSubmit'),
    bash('llm-orchestrator run start --trivial "typo in README"'),
    tool('Edit', { file_path: '/p/README.md' }),
    claude('UserPromptSubmit'),
  ]);
  assert.equal(outputs[2], null);
  assert.equal(session.run, null);
  assert.equal(history.length, 1);
  assert.equal(history[0].trivial, true);
  assert.equal(history[0].reason, 'typo in README');
  assert.equal(history[0].started_outside_flow, false);
});

test('a normal run survives prompts until run close, which writes the history line', () => {
  const { session, history } = run([
    claude('UserPromptSubmit'),
    bash('llm-orchestrator run start --type FEATURE --shards 2'),
    claude('SubagentStart', { agent_id: 'a1', agent_type: 'test-engineer' }),
    claude('UserPromptSubmit'),
    claude('SubagentStart', { agent_id: 'a2', agent_type: 'backend-fixer' }),
    bash('llm-orchestrator run close'),
  ]);
  assert.equal(session.run, null);
  assert.equal(history.length, 1);
  assert.deepEqual(
    { type: history[0].task_type, planned: history[0].planned_shards, started: history[0].subagents_started, outside: history[0].started_outside_flow },
    { type: 'FEATURE', planned: 2, started: 2, outside: false },
  );
});

test('work before run start marks the run as started outside the flow', () => {
  const { history } = run([claude('UserPromptSubmit'), bash('ssh prod ls'), bash('llm-orchestrator run start --type INCIDENT'), bash('llm-orchestrator run close')]);
  assert.equal(history[0].started_outside_flow, true);
});

test('a prompt that did work but never opened a run is recorded as skipped at the next prompt', () => {
  const { history } = run([claude('UserPromptSubmit'), bash('grep x'), tool('Edit', { file_path: '/p/a.js' }), claude('UserPromptSubmit')]);
  assert.equal(history.length, 1);
  assert.equal(history[0].skipped_flow, true);
  assert.equal(history[0].task_type, null);
});

test('opening a run over an open run closes the first by succession', () => {
  const { history, session } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type FEATURE'), bash('llm-orchestrator run start --type BUG_FIX')]);
  assert.equal(history.length, 1);
  assert.equal(history[0].closed_by, 'succession');
  assert.equal(session.run.task_type, 'BUG_FIX');
});

test('history lines carry ids, types, counts and times only', () => {
  const { history } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type FEATURE'), bash('secret-tool --token abc123'), bash('llm-orchestrator run close')]);
  const text = JSON.stringify(history);
  assert.ok(!text.includes('abc123') && !text.includes('secret-tool'), 'no tool input may reach the ledger');
  assert.deepEqual(Object.keys(history[0]).sort(), ['closed_at', 'closed_by', 'dispatch_nudged', 'duration_s', 'inline_reason', 'generic_dispatches', 'inline_after_nudge', 'live_calls', 'opened_at', 'overreach', 'planned_shards', 'reason', 'role_dispatches', 'session', 'skipped_flow', 'started_outside_flow', 'subagents_started', 'task_id', 'task_type', 'trivial'].sort());
});

// ------------------------------------------------------------------ harness payloads
test('Codex apply_patch and OpenCode tool payloads normalize to the same events', () => {
  const codex = normalizePayload({ hook_event_name: 'PreToolUse', session_id: 's', turn_id: 't', tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch' } });
  assert.equal(codex.kind, 'tool');
  const opencode = normalizePayload({ harness: 'opencode', hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'read', tool_input: { filePath: '/p/AGENTS.md' } });
  assert.equal(opencode.kind, 'tool');
  assert.equal(opencode.instruction, true);
});

// ------------------------------------------------------------------ guarantees
test('the gate never denies, blocks or exits non-zero — every event, every state', async () => {
  const project = await mkdtemp(join(tmpdir(), 'flow-gate-'));
  const payloads = [
    { hook_event_name: 'UserPromptSubmit', session_id: 's', prompt: 'x' },
    { hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } },
    { hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Edit', tool_input: { file_path: '/etc/passwd' } },
    { hook_event_name: 'SubagentStart', session_id: 's', agent_id: 'a' },
    { hook_event_name: 'Stop', session_id: 's' },
    { hook_event_name: 'PreToolUse', session_id: '../../escape', tool_name: 'Bash', tool_input: { command: 'ls' } },
  ];
  const raw = [...payloads.map((payload) => JSON.stringify(payload)), 'not json', '', '{"hook_event_name":'];
  for (const input of raw) {
    const result = spawnSync(process.execPath, [CLI, 'gate', '--project', project], { input, encoding: 'utf8' });
    assert.equal(result.status, 0, `exit ${result.status} for ${input}`);
    assert.doesNotMatch(result.stdout, /deny|block|"decision"/i, `forbidden decision for ${input}`);
    assert.equal(result.stderr, '', `stderr for ${input}`);
    if (result.stdout.trim()) {
      const parsed = JSON.parse(result.stdout);
      assert.deepEqual(Object.keys(parsed), ['hookSpecificOutput']);
      assert.deepEqual(Object.keys(parsed.hookSpecificOutput).sort(), ['additionalContext', 'hookEventName']);
    }
  }
});

test('a corrupt or unwritable ledger fails open: exit 0, no output', async () => {
  const project = await mkdtemp(join(tmpdir(), 'flow-gate-corrupt-'));
  await mkdir(join(project, '.orchestrator-run', 'sessions'), { recursive: true });
  await writeFile(join(project, '.orchestrator-run', 'sessions', 's.json'), '{broken');
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Bash', tool_input: { command: 'ls' } });
  const result = spawnSync(process.execPath, [CLI, 'gate', '--project', project], { input, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  // A project path that is a regular file cannot hold a ledger at all.
  const notADirectory = join(project, 'plain-file');
  await writeFile(notADirectory, 'x');
  const missing = spawnSync(process.execPath, [CLI, 'gate', '--project', notADirectory], { input, encoding: 'utf8' });
  assert.equal(missing.status, 0);
  assert.equal(missing.stdout, '');
});

test('a project that does not use orchestrate-core is never steered and gets no ledger', async () => {
  const project = await mkdtemp(join(tmpdir(), 'flow-gate-foreign-'));
  await writeFile(join(project, 'AGENTS.md'), '# Some other project\n');
  const out = await handleHook({ payload: { session_id: 'z', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'grep x' } }, project });
  assert.equal(out, null);
  await assert.rejects(readFile(join(project, '.orchestrator-run', '.gitignore'), 'utf8'), 'no ledger may be created in a foreign project');
});

test('handleHook persists state across invocations and appends history', async () => {
  const project = await mkdtemp(join(tmpdir(), 'flow-gate-io-'));
  await writeFile(join(project, 'AGENTS.md'), 'load the [orchestration entrypoint](.agents/skills/orchestrate/SKILL.md)\n');
  const send = (payload, now) => handleHook({ payload: { session_id: 'sx', ...payload }, project, now });
  await send({ hook_event_name: 'UserPromptSubmit' }, T0);
  const first = await send({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'grep x' } }, T0 + 1);
  assert.equal(first?.hookSpecificOutput?.additionalContext, NUDGE);
  const second = await send({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'grep y' } }, T0 + 2);
  assert.equal(second, null);
  await send({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'llm-orchestrator run start --type BUG_FIX' } }, T0 + 3);
  await send({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'llm-orchestrator run close' } }, T0 + 4);
  const lines = (await readFile(join(project, '.orchestrator-run', 'history.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].started_outside_flow, true);
});

// ------------------------------------------------------------------ audit
test('adherenceSummary counts runs, trivial runs, runs started outside the flow and undispatched plans', () => {
  const summary = adherenceSummary([
    { task_type: 'FEATURE', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: 3, subagents_started: 2 },
    { task_type: 'BUG_FIX', trivial: false, skipped_flow: false, started_outside_flow: true, planned_shards: 5, subagents_started: 0 },
    { task_type: null, trivial: true, skipped_flow: false, started_outside_flow: false, planned_shards: null, subagents_started: 0 },
    { task_type: null, trivial: false, skipped_flow: true, started_outside_flow: false, planned_shards: null, subagents_started: 0 },
  ]);
  assert.deepEqual(summary, { tasks: 4, runs: 3, trivial: 1, skipped_flow: 1, started_outside_flow: 1, planned_but_not_dispatched: 1, runs_without_plan: 0, inline_declared: 0, inline_after_nudge: 0, trivial_overreach: 0, role_dispatches: 0, generic_dispatches: 0, runs_without_roles: 0, below_fan_out: 0 });
});

test('an event delivered twice (plugin + CLI install) is counted once', () => {
  const { outputs, history, session } = run([
    claude('UserPromptSubmit', { prompt_id: 'p1' }),
    claude('UserPromptSubmit', { prompt_id: 'p1' }),
    bash('llm-orchestrator run start --type FEATURE --shards 2', { tool_use_id: 't1' }),
    bash('llm-orchestrator run start --type FEATURE --shards 2', { tool_use_id: 't1' }),
    claude('SubagentStart', { agent_id: 'a1' }),
    claude('SubagentStart', { agent_id: 'a1' }),
  ]);
  assert.ok(outputs.every((output) => output === null));
  assert.equal(history.length, 0, 'a duplicated run start must not close the run by succession');
  assert.equal(session.run.subagents_started, 1);
});

test('the runnable form the nudge prints is recognised as the run command', () => {
  const cli = 'node "/Users/u/.agents/skills/orchestrate-core/bin/llm-orchestrator.mjs"';
  const { session, outputs } = run([claude('UserPromptSubmit'), bash(`${cli} run start --type REFACTOR`), bash(`${cli} route --task REFACTOR`)]);
  assert.equal(session.run.task_type, 'REFACTOR');
  assert.ok(outputs.every((output) => output === null));
});

test('after the entrypoint is loaded, discovery reads before run start are not a deviation', () => {
  // The exact order the 2026-09-23 headless run followed: skill, protocol, grep, rtk check, run start.
  const { outputs, history } = run([
    claude('UserPromptSubmit'),
    tool('Skill', { skill: 'orchestrate-core' }),
    tool('Read', { file_path: '/home/u/.claude/skills/orchestrate-core/protocol.md' }),
    tool('Grep', { pattern: 'toggleTodo' }),
    bash('command -v rtk && rtk --version'),
    bash('git status'),
    bash('llm-orchestrator run start --type BUG_FIX --shards 2'),
    bash('llm-orchestrator run close'),
  ]);
  assert.ok(outputs.every((output) => output === null), JSON.stringify(outputs));
  assert.equal(history[0].started_outside_flow, false);
});

test('with the entrypoint loaded, an edit or a mutating command before run start still gets the nudge', () => {
  for (const work of [tool('Edit', { file_path: '/p/a.js' }), bash('npm install left-pad'), bash('cat a.js > b.js'), tool('Agent', { prompt: 'fix it' })]) {
    const { outputs } = run([claude('UserPromptSubmit'), tool('Skill', { skill: 'orchestrate-core' }), work]);
    assert.equal(outputs[2]?.additionalContext, NUDGE, JSON.stringify(work));
  }
});

test('without the entrypoint, even a read-only grep is the start of unplanned work', () => {
  const { outputs } = run([claude('UserPromptSubmit'), tool('Grep', { pattern: 'x' })]);
  assert.equal(outputs[1]?.additionalContext, NUDGE);
});

// ------------------------------------------------------------------ dispatch nudge
const work = (n) => Array.from({ length: n }, (_, index) => bash(`ssh prod "grep ERROR /var/log/app.log | tail -${index + 1}"`));

test('a planned multi-shard run with no subagent gets one dispatch nudge after six main-thread work calls', () => {
  const { outputs } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type FEATURE --shards 3'), ...work(8)]);
  const nudges = outputs.filter(Boolean);
  assert.equal(nudges.length, 1, JSON.stringify(outputs));
  assert.equal(outputs.indexOf(nudges[0]), 7, 'fires on the sixth work call after run start (2 per shard)');
  assert.equal(nudges[0].additionalContext, DISPATCH_NUDGE(3, 'FEATURE'));
});

test('the dispatch nudge stays silent once a subagent started, for --inline, and for single-shard runs', () => {
  const dispatched = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INCIDENT --shards 3'), claude('SubagentStart', { agent_id: 'a1' }), ...work(8)]);
  assert.ok(dispatched.outputs.every((output) => output === null));

  const inline = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type BUG_FIX --shards 2 --inline "stateful:browser checkout session"'), ...work(8)]);
  assert.ok(inline.outputs.every((output) => output === null));
  assert.equal(inline.session.run.inline_reason, 'stateful:browser checkout session');

  const single = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type BUG_FIX --shards 1'), ...work(8)]);
  assert.ok(single.outputs.every((output) => output === null));
});

test('subagent tool calls and instruction reads do not count toward the dispatch nudge', () => {
  const { outputs } = run([
    claude('UserPromptSubmit'),
    bash('llm-orchestrator run start --type INCIDENT --shards 2'),
    ...Array.from({ length: 8 }, () => bash('grep x', { agent_id: 'a9' })),
    ...Array.from({ length: 8 }, () => tool('Read', { file_path: '/p/AGENTS.md' })),
  ]);
  assert.ok(outputs.every((output) => output === null));
});

test('the audit counts inline declarations and evidence runs below the fan-out minimum', () => {
  const summary = adherenceSummary([
    { task_type: 'INCIDENT', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: 1, subagents_started: 0, inline_reason: null, live_calls: 5 },
    { task_type: 'INVESTIGATION', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: null, subagents_started: 0, inline_reason: null, live_calls: 5 },
    { task_type: 'RESEARCH', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: 1, subagents_started: 0, inline_reason: 'stateful:ssh session', live_calls: 5 },
    { task_type: 'BUG_FIX', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: 1, subagents_started: 0, inline_reason: null, live_calls: 5 },
    { task_type: 'INCIDENT', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: 3, subagents_started: 3, inline_reason: null, live_calls: 5 },
  ]);
  assert.equal(summary.inline_declared, 1);
  assert.equal(summary.below_fan_out, 2, 'INCIDENT@1 and INVESTIGATION@null; the declared-inline RESEARCH run is excused');
});

test('two handlers receiving the same events concurrently record each event once', async () => {
  // Claude Code runs matching hooks in parallel: plugin + CLI install both fire.
  const project = await mkdtemp(join(tmpdir(), 'flow-gate-race-'));
  await writeFile(join(project, 'AGENTS.md'), 'uses orchestrate-core\n');
  const both = (payload) => Promise.all([0, 1].map(() => handleHook({ payload: { session_id: 'race', ...payload }, project })));
  await both({ hook_event_name: 'UserPromptSubmit', prompt_id: 'p1' });
  await both({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'llm-orchestrator run start --type INCIDENT --shards 2' }, tool_use_id: 't1' });
  await both({ hook_event_name: 'SubagentStart', agent_id: 'a1' });
  await both({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'llm-orchestrator run close' }, tool_use_id: 't2' });
  const lines = (await readFile(join(project, '.orchestrator-run', 'history.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.equal(JSON.parse(lines[0]).subagents_started, 1);
});

test('echo and printf without redirection are read-only discovery', () => {
  const { outputs } = run([claude('UserPromptSubmit'), tool('Skill', { skill: 'orchestrate-core' }), bash('find .agents -maxdepth 4 -type f | sort && echo --- && cat AGENTS.md')]);
  assert.ok(outputs.every((output) => output === null));
  const { outputs: redirected } = run([claude('UserPromptSubmit'), tool('Skill', { skill: 'orchestrate-core' }), bash('echo x > notes.md')]);
  assert.equal(redirected[2]?.additionalContext, NUDGE);
});

// ------------------------------------------------------------------ trivial overreach + turn end
const edit = (file_path, extra) => tool('Edit', { file_path, old_string: 'a', new_string: 'b' }, extra);
const TRIVIAL = bash('llm-orchestrator run start --trivial "one-line fix"');

test('the start nudge presents trivial as the narrow exception', () => {
  assert.match(NUDGE, /only for a one-line change such as a typo or a version bump/);
});

test('a trivial run that edits a second file gets one overreach nudge', () => {
  const { outputs, session } = run([claude('UserPromptSubmit'), TRIVIAL, edit('/p/src/a.mjs'), edit('/p/src/a.mjs'), edit('/p/src/b.mjs'), edit('/p/src/c.mjs')]);
  assert.deepEqual(outputs.map((output) => output?.kind ?? null), [null, null, null, null, 'overreach', null]);
  assert.match(outputs[4].additionalContext, /declared trivial, but it now touches 2 files/);
  assert.ok(session.run.edited_files.every((entry) => /^[0-9a-f]{12}$/.test(entry)), 'only hashes of paths, never paths');
});

test('a trivial run that adds or edits a test gets the overreach nudge at once', () => {
  for (const testFile of ['/p/test/avg.test.mjs', '/p/src/__tests__/x.js', '/p/spec/y_spec.rb', '/p/tests/test_z.py']) {
    const { outputs } = run([claude('UserPromptSubmit'), TRIVIAL, tool('Write', { file_path: testFile, content: 'x' })]);
    assert.equal(outputs[2]?.kind, 'overreach', testFile);
  }
});

test('Codex apply_patch counts every file in the patch', () => {
  const patch = '*** Begin Patch\n*** Update File: src/a.mjs\n@@\n-x\n+y\n*** Add File: src/b.mjs\n+z\n*** End Patch';
  const { outputs } = run([claude('UserPromptSubmit'), TRIVIAL, tool('apply_patch', { command: patch })]);
  assert.equal(outputs[2]?.kind, 'overreach');
});

test('a typed run never gets the overreach nudge', () => {
  const { outputs } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type FEATURE --shards 1'), edit('/p/a.mjs'), edit('/p/b.mjs'), edit('/p/test/a.test.mjs')]);
  assert.ok(outputs.every((output) => output === null));
});

test('Stop closes a trivial run at the end of the turn, records overreach, and emits nothing', () => {
  const { outputs, history, session } = run([claude('UserPromptSubmit'), TRIVIAL, edit('/p/a.mjs'), edit('/p/b.mjs'), claude('Stop')]);
  assert.equal(outputs[4], null);
  assert.equal(session.run, null);
  assert.equal(history.length, 1);
  assert.equal(history[0].closed_by, 'turn_end');
  assert.equal(history[0].overreach, true);
});

test('Stop leaves a typed run open across turns', () => {
  const { session, history } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type BUG_FIX'), claude('Stop')]);
  assert.equal(session.run.task_type, 'BUG_FIX');
  assert.equal(history.length, 0);
});

test('the audit counts trivial overreach', () => {
  const summary = adherenceSummary([
    { task_type: null, trivial: true, overreach: true, skipped_flow: false, started_outside_flow: false, planned_shards: null, subagents_started: 0, inline_reason: null },
    { task_type: null, trivial: true, overreach: false, skipped_flow: false, started_outside_flow: false, planned_shards: null, subagents_started: 0, inline_reason: null },
  ]);
  assert.equal(summary.trivial_overreach, 1);
});

test('subagent tool calls never touch the ledger, so they cannot contend for the session lock', async () => {
  const project = await mkdtemp(join(tmpdir(), 'flow-gate-subagent-io-'));
  await writeFile(join(project, 'AGENTS.md'), 'uses orchestrate-core\n');
  const out = await handleHook({ payload: { session_id: 'sub', hook_event_name: 'PreToolUse', agent_id: 'a1', tool_name: 'Edit', tool_input: { file_path: '/p/x' } }, project });
  assert.equal(out, null);
  await assert.rejects(readFile(join(project, '.orchestrator-run', 'sessions', 'sub.json'), 'utf8'), 'a subagent tool call must not create or write session state');
});

test('a lock left by a dead handler is taken over at once, not after the stale timeout', async () => {
  const project = await mkdtemp(join(tmpdir(), 'flow-gate-deadlock-'));
  await writeFile(join(project, 'AGENTS.md'), 'uses orchestrate-core\n');
  const lock = join(project, '.orchestrator-run', 'sessions', 'dead.json.lock');
  await mkdir(lock, { recursive: true });
  await writeFile(join(lock, 'owner'), '999999\n'); // no such process
  const started = Date.now();
  await handleHook({ payload: { session_id: 'dead', hook_event_name: 'SubagentStart', agent_id: 'a1' }, project });
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started}ms`);
  const session = JSON.parse(await readFile(join(project, '.orchestrator-run', 'sessions', 'dead.json'), 'utf8'));
  assert.equal(session.subagents_without_run, 1, 'the event must be recorded, not dropped');
});

// ------------------------------------------------------------------ findings from real Events sessions
test('resuming a subagent (SendMessage) is not a new dispatch, even long after it started', () => {
  // Events session 1c2aa1a8: 4 dispatches + 1 resume were counted as 5. The seen-window
  // dedup had long evicted the first SubagentStart by the time the resume fired.
  const filler = Array.from({ length: 80 }, (_, index) => bash(`grep ${index}`, { tool_use_id: `f${index}` }));
  const { session } = run([
    claude('UserPromptSubmit'),
    bash('llm-orchestrator run start --type INCIDENT --shards 4'),
    ...['a1', 'a2', 'a3', 'a4'].map((agent_id) => claude('SubagentStart', { agent_id })),
    ...filler,
    claude('SubagentStart', { agent_id: 'a1' }),
  ]);
  assert.equal(session.run.subagents_started, 4);
  assert.ok(session.run.subagent_ids.every((entry) => /^[0-9a-f]{12}$/.test(entry)));
});

test('SessionEnd closes whatever run is still open, typed or trivial', () => {
  const { history, session } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INVESTIGATION --shards 5'), claude('SessionEnd')]);
  assert.equal(session.run, null);
  assert.equal(history.length, 1);
  assert.equal(history[0].closed_by, 'session_end');
  assert.equal(history[0].task_type, 'INVESTIGATION');
});

test('below_fan_out does not flag an evidence run that did dispatch two or more subagents', () => {
  const summary = adherenceSummary([
    { task_type: 'INCIDENT', trivial: false, skipped_flow: false, planned_shards: 1, subagents_started: 4, inline_reason: null, live_calls: 5 },
    { task_type: 'INCIDENT', trivial: false, skipped_flow: false, planned_shards: 1, subagents_started: 0, inline_reason: null, live_calls: 5 },
  ]);
  assert.equal(summary.below_fan_out, 1);
});

test('the dispatch reminder threshold is proportional: two main-thread work calls per planned shard', () => {
  for (const [shards, expectedAt] of [[2, 4], [3, 6], [5, 10]]) {
    const { outputs } = run([claude('UserPromptSubmit'), bash(`llm-orchestrator run start --type FEATURE --shards ${shards}`), ...work(12)]);
    const at = outputs.findIndex((output) => output?.kind === 'dispatch');
    assert.equal(at - 1, expectedAt, `--shards ${shards}: nudge after ${at - 1} work calls, expected ${expectedAt}`);
  }
});

// ------------------------------------------------------------------ role adherence
test('subagents are classified as orchestrator roles or generic by agent_type', () => {
  const { session } = run([
    claude('UserPromptSubmit'),
    bash('llm-orchestrator run start --type INCIDENT --shards 3'),
    claude('SubagentStart', { agent_id: 'a1', agent_type: 'production-telemetry-collector' }),
    claude('SubagentStart', { agent_id: 'a2', agent_type: 'llm-orchestrator:route-data-flow-tracer' }),
    claude('SubagentStart', { agent_id: 'a3', agent_type: 'general-purpose' }),
    claude('SubagentStart', { agent_id: 'a4', agent_type: 'Explore' }),
    claude('SubagentStart', { agent_id: 'a5' }),
    claude('SubagentStart', { agent_id: 'a3', agent_type: 'general-purpose' }), // resume: not counted again
  ]);
  assert.equal(session.run.subagents_started, 5);
  assert.equal(session.run.role_dispatches, 2, 'plain and plugin-namespaced role ids both count');
  assert.equal(session.run.generic_dispatches, 2, 'general-purpose and Explore are not orchestrator roles');
});

test('the dispatch reminder names the roles of the task flow', () => {
  const { outputs } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INCIDENT --shards 2'), ...work(6)]);
  const text = outputs.find((output) => output?.kind === 'dispatch').additionalContext;
  assert.match(text, /production-telemetry-collector, route-data-flow-tracer/);
  assert.match(text, /not a general-purpose agent/);
  assert.doesNotMatch(text, /orchestrator,|, orchestrator/, 'the orchestrator is the main thread, never a dispatch target');
});

test('the audit counts generic dispatches and runs that used no orchestrator role', () => {
  const summary = adherenceSummary([
    { task_type: 'INCIDENT', trivial: false, skipped_flow: false, planned_shards: 3, subagents_started: 3, role_dispatches: 0, generic_dispatches: 3 },
    { task_type: 'FEATURE', trivial: false, skipped_flow: false, planned_shards: 2, subagents_started: 2, role_dispatches: 2, generic_dispatches: 0 },
    { task_type: 'BUG_FIX', trivial: false, skipped_flow: false, planned_shards: 2, subagents_started: 2, role_dispatches: 1, generic_dispatches: 1 },
  ]);
  assert.equal(summary.generic_dispatches, 4);
  assert.equal(summary.role_dispatches, 3);
  assert.equal(summary.runs_without_roles, 1);
});

test('plugin-namespaced agent types resolve to roles in both spellings', async () => {
  const { roleKind } = await import('../lib/flow-gate.mjs');
  assert.equal(roleKind('llm-orchestrator:backend-fixer'), 'role');
  assert.equal(roleKind('caveman:cavecrew-builder'), 'role');
  assert.equal(roleKind('general-purpose'), 'generic');
  assert.equal(roleKind(undefined), null);
});

// ------------------------------------------------------------------ evidence flows: earlier + second reminder
test('evidence flows get the dispatch reminder after one work call per shard', () => {
  const { outputs } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INCIDENT --shards 3'), ...work(12)]);
  const first = outputs.findIndex((output) => output?.kind === 'dispatch');
  assert.equal(first - 1, 3, 'INCIDENT --shards 3: first reminder after 3 work calls');
});

test('an ignored reminder on an evidence flow gets exactly one firmer follow-up', () => {
  const { outputs, session } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INVESTIGATION --shards 2'), ...work(20)]);
  const kinds = outputs.map((output, index) => output && [index - 1, output.kind]).filter(Boolean);
  assert.deepEqual(kinds, [[2, 'dispatch'], [4, 'dispatch_followup']]);
  assert.match(outputs[5].additionalContext, /reminder was not acted on/);
  assert.equal(session.run.dispatch_nudges, 2);
});

test('non-evidence flows keep one reminder at two calls per shard, never a follow-up', () => {
  const { outputs } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type FEATURE --shards 2'), ...work(20)]);
  assert.deepEqual(outputs.map((output, index) => output && [index - 1, output.kind]).filter(Boolean), [[4, 'dispatch']]);
});

test('no follow-up once a subagent started or the chain was declared inline', () => {
  const dispatched = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INCIDENT --shards 2'), ...work(3), claude('SubagentStart', { agent_id: 'a1', agent_type: 'production-telemetry-collector' }), ...work(10)]);
  assert.equal(dispatched.outputs.filter((output) => output?.kind === 'dispatch_followup').length, 0);
});

test('--inline declared after a dispatch reminder is recorded as retroactive', () => {
  const { history } = run([
    claude('UserPromptSubmit'),
    bash('llm-orchestrator run start --type INVESTIGATION --shards 3'),
    ...work(4),
    bash('llm-orchestrator run start --type INVESTIGATION --inline "stateful: evidence already read"'),
    bash('llm-orchestrator run close'),
  ]);
  assert.equal(history.length, 2);
  assert.equal(history[1].inline_after_nudge, true);
  const upfront = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INCIDENT --shards 2 --inline "stateful:ssh session"'), bash('llm-orchestrator run close')]);
  assert.equal(upfront.history[0].inline_after_nudge, false);
  assert.equal(adherenceSummary(history).inline_after_nudge, 1);
});

// ------------------------------------------------------------------ A: trivial is not an investigation
test('a trivial run that keeps working past eight calls gets the overreach reminder, even read-only', () => {
  const reads = Array.from({ length: 10 }, (_, index) => tool('Read', { file_path: `/p/logs/${index}.log` }, { tool_use_id: `r${index}` }));
  const { outputs, history } = run([claude('UserPromptSubmit'), TRIVIAL, ...reads, claude('Stop')]);
  const at = outputs.findIndex((output) => output?.kind === 'overreach');
  assert.equal(at - 1, 9, 'fires on the ninth work call under a trivial run');
  assert.match(outputs[at].additionalContext, /not an investigation/);
  assert.equal(history[0].overreach, true);
});

// ------------------------------------------------------------------ B: --inline must name live state
test('--inline without a stateful: reason is not a valid run', async () => {
  const { parseRunArgs } = await import('../lib/flow-gate.mjs');
  assert.equal(parseRunArgs(['start', '--type', 'INCIDENT', '--inline', 'small bounded evidence review']), null);
  assert.equal(parseRunArgs(['start', '--type', 'INCIDENT', '--inline', 'stateful:']), null, 'the state must be named');
  assert.equal(parseRunArgs(['start', '--type', 'INCIDENT', '--inline', 'stateful:browser checkout session']).inline, 'stateful:browser checkout session');
  const { session } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INCIDENT --shards 2 --inline "no change requested"')]);
  assert.equal(session.run, null, 'an invalid --inline opens no run, so the steering stays on');
});

test('the run CLI rejects an --inline reason that names no state, with a pointed message', () => {
  const result = spawnSync(process.execPath, [CLI, 'run', 'start', '--type', 'INCIDENT', '--inline', 'small review'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--inline must name the live state/);
});

// ------------------------------------------------------------------ C: evidence size — live sources
const live = (n) => Array.from({ length: n }, (_, index) => bash(`ssh prod-api "tail -n 200 /var/log/app.log | grep -c ERROR${index}"`));
const local = (n) => Array.from({ length: n }, (_, index) => tool('Read', { file_path: `/p/logs/${index}.log` }));

test('in evidence flows the follow-up reminder is for live sources only', () => {
  const localOnly = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INVESTIGATION --shards 2'), ...local(12)]);
  assert.deepEqual(localOnly.outputs.map((o) => o?.kind).filter(Boolean), ['dispatch'], 'small local evidence: one reminder, no follow-up');
  const liveRun = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INVESTIGATION --shards 2'), ...live(12)]);
  assert.deepEqual(liveRun.outputs.map((o) => o?.kind).filter(Boolean), ['dispatch', 'dispatch_followup']);
  assert.equal(liveRun.session.run.live_calls, 12);
});

test('below_fan_out counts only evidence runs that touched live sources', () => {
  const summary = adherenceSummary([
    { task_type: 'INCIDENT', trivial: false, skipped_flow: false, planned_shards: 1, subagents_started: 0, inline_reason: null, live_calls: 0 },
    { task_type: 'INCIDENT', trivial: false, skipped_flow: false, planned_shards: 1, subagents_started: 0, inline_reason: null, live_calls: 7 },
  ]);
  assert.equal(summary.below_fan_out, 1);
});

test('live sources are recognised: ssh, remote databases, cluster and cloud CLIs, HTTP clients', async () => {
  const { isLiveSource } = await import('../lib/flow-gate.mjs');
  for (const command of ['ssh prod "uptime"', 'rtk ssh db1 ls', 'psql -h prod -c "select 1"', 'mysql -h x', 'kubectl logs api-7f', 'docker exec api cat /log', 'aws logs tail /api', 'gcloud logging read', 'curl -s https://api.example.com/health', 'redis-cli -h cache info']) {
    assert.ok(isLiveSource(command), command);
  }
  for (const command of ['cat logs/api.log', 'grep ERROR logs/*.log', 'node --test', 'git log']) assert.ok(!isLiveSource(command), command);
});

test('a trivial run counts its live calls, and querying production twice is not trivial', () => {
  const { outputs, session } = run([claude('UserPromptSubmit'), TRIVIAL, ...live(3)]);
  assert.equal(session.run.live_calls, 3);
  const at = outputs.findIndex((output) => output?.kind === 'overreach');
  assert.equal(at - 1, 2, 'fires on the second live call, long before eight work calls');
  assert.match(outputs[at].additionalContext, /live/);
});
