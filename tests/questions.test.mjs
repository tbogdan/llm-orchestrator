// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
/**
 * Native, batched user questions. The policy is only real if every harness has a
 * named mechanism, the wiring points at it, and the pre-evaluation object has a
 * place to accumulate the questions.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { nativeCommands } from '../adapters/commands.mjs';
import { bridgeContent } from '../lib/adapter-renderer.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (relative) => readFileSync(root + relative, 'utf8');

test('policies/questions.md names the native mechanism for every harness', () => {
  const text = read('policies/questions.md');
  const mechanisms = {
    'Claude Code': '`AskUserQuestion`',
    Codex: '`request_user_input`',
    OpenCode: '`question` tool',
    Kilo: '`ask_followup_question`',
  };
  for (const [harness, mechanism] of Object.entries(mechanisms)) {
    assert.ok(text.includes(harness), `policies/questions.md does not mention ${harness}`);
    assert.ok(text.includes(mechanism), `policies/questions.md does not name ${mechanism}`);
  }
  assert.ok(text.includes('`update_plan`'), 'the Codex fallback must name update_plan');
  assert.ok(text.includes('<suggest>'), 'the Kilo row must name its <suggest> options');
  assert.ok(text.includes('`question_for_user`'), 'subagents return question_for_user instead of asking');
  assert.ok(text.includes('`blocked_pending_user`'), 'no answer must resolve to blocked_pending_user');
});

test('policies/questions.md lists exactly the four cases execution.md allows', () => {
  const text = read('policies/questions.md');
  for (const phrase of ['Mandatory-tool gap', 'Batched minor findings', 'Destructive or irreversible action', 'Genuine scope ambiguity']) {
    assert.ok(text.includes(phrase), `questions.md is missing the "${phrase}" case`);
  }
  const execution = read('policies/execution.md');
  assert.ok(execution.includes('exactly four\n   exceptions'), 'execution.md must still say the exceptions are exhaustive');
  assert.ok(execution.includes('[questions](questions.md)'), 'execution.md must point at the questions policy');
  assert.ok(read('policies/verification.md').includes('[questions](questions.md)'), 'the minor-findings rule must point at the questions policy');
});

test('the pre-evaluation JSON carries open_questions and explains it', () => {
  const protocolText = read('protocol.md');
  const block = protocolText.slice(protocolText.indexOf('```json'), protocolText.indexOf('```', protocolText.indexOf('```json') + 3));
  assert.ok(block.includes('"open_questions": []'), 'the pre-evaluation example must include open_questions');
  assert.ok(protocolText.includes('`open_questions` accumulates'), 'protocol.md must explain open_questions');
  assert.ok(protocolText.includes('[questions](policies/questions.md)'), 'protocol.md must link the questions policy');
});

test('the capability, the core profile and SKILL.md all know about user.native_question', () => {
  const capabilities = JSON.parse(read('registries/capabilities.json')).capabilities;
  assert.ok(capabilities.some((entry) => entry.id === 'user.native_question'));

  const requirement = JSON.parse(read('registries/core-profile.json')).requirements.find((entry) => entry.id === 'user.native_question');
  assert.equal(requirement.level, 'mandatory');
  assert.equal(requirement.manual_implementation, 'single-explicit-message', 'the fallback is a single explicit message');
  assert.equal(requirement.harness_mechanisms.claude, 'AskUserQuestion');
  assert.equal(requirement.harness_mechanisms.kilo, 'ask_followup_question');
  assert.equal(requirement.harness_mechanisms.opencode, 'question');

  const skill = read('SKILL.md');
  assert.ok(skill.includes('`user.native_question`'));
  assert.ok(skill.includes('[policies/questions.md](policies/questions.md)'));
});

test('the task command checklist says questions are native, batched and asked once', () => {
  const task = nativeCommands('.claude/commands').find((command) => command.path.endsWith('/task.md'));
  assert.ok(task.content.includes('Questions: native, batched, once'));
  assert.ok(task.content.includes('user.native_question'));
  assert.ok(task.content.includes('question_for_user'));
  assert.ok(task.content.includes('blocked_pending_user'));

  // The installed bridge promises the same degraded wording SKILL.md does.
  assert.ok(bridgeContent.includes('`degraded: <item>`'), 'the bridge must promise the degraded line wording');
  assert.ok(bridgeContent.includes('native question mechanism'), 'the bridge must carry the question rule');
});
