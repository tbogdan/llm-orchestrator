// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { decide, emptySession, normalizePayload, handleHook, adherenceSummary, NUDGE, dispatchNudgeFor } from '../lib/flow-gate.mjs';

const DISPATCH_NUDGE = (n) => dispatchNudgeFor('llm-orchestrator', n);

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
  assert.deepEqual(Object.keys(history[0]).sort(), ['closed_at', 'closed_by', 'dispatch_nudged', 'duration_s', 'inline_reason', 'opened_at', 'planned_shards', 'reason', 'session', 'skipped_flow', 'started_outside_flow', 'subagents_started', 'task_id', 'task_type', 'trivial'].sort());
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
  assert.deepEqual(summary, { tasks: 4, runs: 3, trivial: 1, skipped_flow: 1, started_outside_flow: 1, planned_but_not_dispatched: 1, runs_without_plan: 0, inline_declared: 0, below_fan_out: 0 });
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
  const { outputs } = run([claude('UserPromptSubmit'), bash('llm-orchestrator run start --type INCIDENT --shards 3'), ...work(8)]);
  const nudges = outputs.filter(Boolean);
  assert.equal(nudges.length, 1, JSON.stringify(outputs));
  assert.equal(outputs.indexOf(nudges[0]), 7, 'fires on the sixth work call after run start');
  assert.equal(nudges[0].additionalContext, DISPATCH_NUDGE(3));
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
    { task_type: 'INCIDENT', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: 1, subagents_started: 0, inline_reason: null },
    { task_type: 'INVESTIGATION', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: null, subagents_started: 0, inline_reason: null },
    { task_type: 'RESEARCH', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: 1, subagents_started: 0, inline_reason: 'stateful:ssh session' },
    { task_type: 'BUG_FIX', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: 1, subagents_started: 0, inline_reason: null },
    { task_type: 'INCIDENT', trivial: false, skipped_flow: false, started_outside_flow: false, planned_shards: 3, subagents_started: 3, inline_reason: null },
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
