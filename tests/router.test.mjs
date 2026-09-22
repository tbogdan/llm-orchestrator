import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate } from './schema-validator.mjs';
import { classify, rankModels, admittedModels, cheapestThinkingFor, estimateFlow, explain, loadMatrix, loadTopModels, parsePair, maxPair } from '../lib/router.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(root + path, 'utf8'));

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
test('routing-matrix.json validates against its schema', () => {
  const errors = validate(readJson('schemas/routing-matrix.schema.json'), readJson('registries/routing-matrix.json'));
  assert.deepEqual(errors, []);
});

test('top-models.json validates against its schema', () => {
  const errors = validate(readJson('schemas/top-models.schema.json'), readJson('models/top-models.json'));
  assert.deepEqual(errors, []);
});

test('both registries carry the attribution marker as the first key', () => {
  for (const path of ['registries/routing-matrix.json', 'models/top-models.json', 'schemas/routing-matrix.schema.json', 'schemas/top-models.schema.json']) {
    assert.equal(Object.keys(readJson(path))[0], '_attribution', path);
  }
});

test('the shortlist is exactly 21 routable models: 11 ladder incumbents and 10 measured candidates', () => {
  // 11 incumbents since Claude Opus 5.5 took the Claude X seat and Opus 5 stayed
  // routable as its fallback.
  const top = loadTopModels();
  assert.equal(top.models.length, 21);
  assert.equal(top.models.filter((model) => model.admission === 'incumbent').length, 11);
  assert.equal(top.models.filter((model) => model.admission === 'candidate').length, 10);
  assert.deepEqual(
    top.models.filter((model) => model.admission === 'candidate').map((model) => model.key).sort(),
    ['deepseek-v4-1-flash', 'gemini-3-8-flash', 'glm-5-3', 'glm-5-3-flash', 'grok-4-6', 'kimi-k3', 'mimo-v2-6-pro', 'minimax-m3', 'muse-spark-1-3', 'qwen3-8-max'],
  );
  for (const model of top.models) {
    assert.ok(['codex', 'claude', 'open', 'third-party', null].includes(model.ladder), `${model.key} has an unknown ladder`);
    assert.equal(typeof model.observed_at, 'string', `${model.key} has no observed_at`);
    assert.ok(model.indices?.thinking_cost_index, `${model.key} has no thinking_cost_index`);
  }
  assert.equal(top.candidates.length, 1, 'Step 5 stays an unpromoted candidate');
  assert.equal(top.candidates[0].key, 'step-5');
});

test('candidate tiers come from the documented score bands, never from a display name', () => {
  const top = loadTopModels();
  const bands = top.tier_bands.bands;
  assert.equal(top.tier_bands.applies_to, 'candidate');
  for (const model of top.models.filter((entry) => entry.admission === 'candidate')) {
    const scores = Object.values(model.measured).map((point) => point.score).filter((score) => score !== null);
    const best = Math.max(...scores);
    const band = bands[model.tier];
    assert.ok(band, `${model.key} has no band for tier ${model.tier}`);
    if (band.min !== null) assert.ok(best >= band.min, `${model.key} best ${best} below the ${model.tier} band`);
    if (band.max !== null) assert.ok(best <= band.max, `${model.key} best ${best} above the ${model.tier} band`);
    assert.deepEqual(model.eligible_tiers, [model.tier]);
  }
});

test('thinking_cost_index is anchored on Sol `medium` = 100 and marginal steps are ratios of measured points', () => {
  const top = loadTopModels();
  const sol = top.models.find((model) => model.key === 'gpt-5-6-sol');
  assert.equal(sol.indices.thinking_cost_index.medium, 100);
  assert.equal(sol.measured.medium.usd_per_task, 0.5);
  for (const model of top.models) {
    for (const [effort, index] of Object.entries(model.indices.thinking_cost_index)) {
      const cost = model.measured[effort].usd_per_task;
      if (cost === null) { assert.equal(index, null, `${model.key}/${effort} invented an index`); continue; }
      assert.equal(index, Number(((100 * cost) / 0.5).toFixed(2)), `${model.key}/${effort} index drifted`);
    }
    for (const [step, value] of Object.entries(model.indices.marginal_thinking)) {
      const [from, to] = step.split('->');
      assert.equal(value.delta_score, model.measured[to].score - model.measured[from].score, `${model.key} ${step} delta drifted`);
      assert.equal(value.cost_multiplier, Number((model.measured[to].usd_per_task / model.measured[from].usd_per_task).toFixed(2)), `${model.key} ${step} multiplier drifted`);
    }
  }
});

test('every pair used by the matrix has a resolution row and every measured point is copied, not invented', () => {
  const matrix = loadMatrix();
  const pairs = new Set([
    ...Object.values(matrix.default_routing),
    ...Object.values(matrix.agent_defaults),
    ...Object.values(matrix.risk_to_review_floor),
    ...Object.values(matrix.risk_floors).flatMap((row) => [row.implementation, row.review]).filter(Boolean),
    ...Object.values(matrix.task_flows).flatMap((flow) => flow.phases.map((phase) => phase.pair)),
  ]);
  for (const pair of pairs) assert.ok(matrix.resolution[pair], `no resolution row for ${pair}`);

  const source = readJson('models/model-thinking-data.json');
  const byKey = new Map(source.models.map((model) => [model.key, new Map(model.measurements.map(([effort, score, cost]) => [effort, { score, cost }]))]));
  let covered = 0;
  for (const model of loadTopModels().models) {
    const measurements = byKey.get(model.key);
    assert.ok(measurements, `${model.key} is not in model-thinking-data.json`);
    assert.deepEqual(Object.keys(model.measured), [...measurements.keys()], `${model.key} does not carry the dataset's effort labels verbatim`);
    // An effort the API supports but the benchmark has not measured must be
    // declared in `unmeasured_levels`, never silently added to `levels`.
    const unmeasured = model.thinking.unmeasured_levels ?? [];
    for (const effort of unmeasured) assert.ok(!measurements.has(effort), `${model.key}/${effort} is measured but listed as unmeasured`);
    assert.deepEqual(
      model.thinking.levels.filter((effort) => !unmeasured.includes(effort)),
      [...measurements.keys()],
      `${model.key} declares thinking levels the dataset did not measure`,
    );
    for (const [effort, point] of Object.entries(model.measured)) {
      const origin = measurements.get(effort);
      assert.ok(origin, `${model.key}/${effort} has no measured origin`);
      assert.equal(point.score, origin.score, `${model.key}/${effort} score drifted from the dataset`);
      assert.equal(point.usd_per_task, origin.cost, `${model.key}/${effort} cost drifted from the dataset`);
    }
    covered += 1;
  }
  assert.equal(covered, 21, 'byte-equality must cover all 21 routable models');
});

test('agent-roles default tiers are full pairs and agree with the routing matrix', () => {
  const matrix = loadMatrix();
  for (const role of readJson('registries/agent-roles.json').roles) {
    assert.match(role.default_tier, /^[WSXF] T[0-5](-T[0-5])?$/, `${role.id} default_tier is not a pair`);
    assert.equal(role.default_tier, matrix.agent_defaults[role.id], `${role.id} disagrees with routing-matrix agent_defaults`);
    assert.ok(matrix.resolution[role.default_tier], `${role.id} default_tier has no resolution row`);
    if (role.review_floor) assert.ok(matrix.resolution[role.review_floor], `${role.id} review_floor has no resolution row`);
  }
});

// ---------------------------------------------------------------------------
// classify()
// ---------------------------------------------------------------------------
test('a mechanical task routes to W T0-T1: Haiku with thinking off, Luna low', () => {
  const result = classify({ task_type: 'FEATURE', phase: 'mechanical', complexity: 'SIMPLE' });
  assert.equal(result.pair, 'W T0-T1');
  assert.equal(result.tier, 'W');
  assert.equal(result.fan_out_min, 1);

  const claude = rankModels({ pair: result.pair, provider: 'anthropic' });
  assert.equal(claude.length, 1);
  assert.equal(claude[0].model, 'claude-4-5-haiku');
  assert.equal(claude[0].effort, null, 'Haiku has no effort parameter — thinking is off at T0/T1');

  const codex = rankModels({ pair: result.pair, provider: 'openai' });
  assert.equal(codex[0].model, 'gpt-5-6-luna');
  assert.equal(codex[0].effort, 'low');
});

test('a refund-eligibility change implements at X T3 and reviews at X T4 with an independent reviewer', () => {
  const result = classify({ task_type: 'BUG_FIX', phase: 'fix', area: 'refund', risk: 'critical', complexity: 'SIMPLE' });
  assert.equal(result.pair, 'X T3');
  assert.equal(result.review_floor, 'X T4');
  assert.equal(result.independent_review, true);
  assert.match(explain(result), /independent reviewer required/);
});

test('risk raises the review floor without inflating the implementation tier', () => {
  const cheap = classify({ task_type: 'FEATURE', phase: 'implementation', risk: 'critical', complexity: 'SIMPLE' });
  assert.equal(cheap.pair, 'S T2', 'route by risk, not by LOC: risk buys review, not a bigger implementer');
  assert.equal(cheap.review_floor, 'X T4');
  assert.equal(cheap.independent_review, true);
});

test('a risk floor only ever moves a pair upward', () => {
  const result = classify({ task_type: 'FEATURE', phase: 'implementation', area: 'ui-cosmetic' });
  assert.equal(result.pair, 'S T2', 'the ui-cosmetic W floor never downgrades an S phase');
  assert.equal(maxPair('S T2', 'W T0-T1'), 'S T2');
  assert.equal(maxPair('S T2', 'X T4'), 'X T4');
});

test('a 250K working set on Claude forces a mechanical task off the W tier', () => {
  const result = classify({ task_type: 'FEATURE', phase: 'mechanical', context_tokens: 250000, harness: 'claude' });
  assert.equal(result.tier, 'S');
  assert.equal(result.pair, 'S T1');
  assert.equal(result.flags.context_escalation, true);
  assert.match(result.reason.join('\n'), /exceeds the W working-set cap/);
});

test('a 300K request on Codex raises the long-context cost bump flag', () => {
  const result = classify({ task_type: 'FEATURE', phase: 'implementation', context_tokens: 300000, harness: 'codex' });
  assert.equal(result.long_context_cost_bump, true);
  assert.match(explain(result), /long-context cost bump/);
  const under = classify({ task_type: 'FEATURE', phase: 'implementation', context_tokens: 100000, harness: 'codex' });
  assert.equal(under.long_context_cost_bump, false);
});

test('classify rejects unknown task types, phases, risks, complexities and areas', () => {
  assert.throws(() => classify({ task_type: 'NOPE', phase: 'plan' }), /Unknown task type/);
  assert.throws(() => classify({ task_type: 'FEATURE', phase: 'nope' }), /Unknown phase/);
  assert.throws(() => classify({ task_type: 'FEATURE', phase: 'plan', risk: 'nope' }), /Unknown risk/);
  assert.throws(() => classify({ task_type: 'FEATURE', phase: 'plan', complexity: 'nope' }), /Unknown complexity/);
  assert.throws(() => classify({ task_type: 'FEATURE', phase: 'plan', area: 'nope' }), /Unknown risk-floor area/);
});

// ---------------------------------------------------------------------------
// rankModels()
// ---------------------------------------------------------------------------
test('Terra and Sol are never ranked above `high` at any pair', () => {
  const matrix = loadMatrix();
  for (const pair of Object.keys(matrix.resolution)) {
    for (const entry of rankModels({ pair, provider: 'openai' })) {
      if (!['gpt-5-6-terra', 'gpt-5-6-sol'].includes(entry.model)) continue;
      assert.ok(['low', 'medium', 'high'].includes(entry.effort), `${entry.model} ranked at ${entry.effort} for ${pair}`);
    }
  }
  const x4 = rankModels({ pair: 'X T4', provider: 'openai' });
  assert.equal(x4[0].model, 'gpt-5-6-sol');
  assert.equal(x4[0].effort, 'high');
  assert.match(x4[0].cap_notes.join(' '), /independent second reviewer/);
});

test('Fable 5.1 is excluded from every ranking unless explicitly requested', () => {
  const matrix = loadMatrix();
  for (const pair of Object.keys(matrix.resolution)) {
    const ranked = rankModels({ pair, provider: 'anthropic' });
    assert.ok(!ranked.some((entry) => entry.model === 'claude-fable-5-1'), `Fable 5.1 leaked into ${pair}`);
  }
  const allowed = rankModels({ pair: 'F T4', provider: 'anthropic', explicitFable51: true });
  const fable51 = allowed.find((entry) => entry.model === 'claude-fable-5-1');
  assert.ok(fable51);
  assert.match(fable51.cap_notes.join(' '), /≤2% of dispatches/);
});

test('unrated models never take a tier seat and dominated configs are labelled', () => {
  const matrix = loadMatrix();
  for (const pair of Object.keys(matrix.resolution)) {
    assert.ok(!rankModels({ pair }).some((entry) => entry.model === 'grok-4-7'), `an available-but-unrated model was promoted into ${pair}`);
  }
  const haiku = rankModels({ pair: 'W T2', provider: 'anthropic' })[0];
  assert.equal(haiku.model, 'claude-4-5-haiku');
  assert.equal(haiku.dominated, true, 'every measured Haiku point is beaten by a cheaper, higher-scoring Luna config');
  const luna = rankModels({ pair: 'W T3', provider: 'openai' })[0];
  assert.equal(luna.dominated, false);
});

test('ranking is cheapest-measured-first and carries prices for unmeasured configs', () => {
  const ranked = rankModels({ pair: 'F T3' });
  const measured = ranked.filter((entry) => entry.est_usd_per_task !== null);
  for (let index = 1; index < measured.length; index += 1) {
    assert.ok(measured[index].est_usd_per_task >= measured[index - 1].est_usd_per_task);
  }
  const fable = ranked.find((entry) => entry.model === 'claude-fable-5');
  assert.equal(fable.est_usd_per_task, null, 'Fable 5 `high` is unmeasured — null, never interpolated');
  assert.equal(fable.price_in, 10);
  assert.equal(fable.price_out, 50);
});

test('a runtime inventory filters out models that are not exposed or lack the effort', () => {
  const inventory = {
    schema_version: 1,
    harness: 'codex',
    models: [
      { id: 'gpt-5.6-luna', provider: 'openai', efforts: ['low', 'medium'], availability: 'exposed' },
      { id: 'gpt-5.6-terra', provider: 'openai', efforts: ['low', 'medium', 'high'], availability: 'configured' },
      { id: 'gpt-5.6-sol', provider: 'openai', efforts: ['medium', 'high'], availability: 'verified' },
    ],
  };
  assert.equal(rankModels({ pair: 'W T0-T1', provider: 'openai', inventory }).length, 1);
  assert.equal(rankModels({ pair: 'S T3', provider: 'openai', inventory }).length, 0, 'configured is not exposed');
  assert.equal(rankModels({ pair: 'W T3', provider: 'openai', inventory }).length, 0, 'xhigh is not in the exposed effort list');
  assert.equal(rankModels({ pair: 'X T3', provider: 'openai', inventory })[0].model, 'gpt-5-6-sol');
  assert.equal(rankModels({ pair: 'F T3', provider: 'openai', inventory }).length, 0, 'Astra is absent from this inventory');
});

// ---------------------------------------------------------------------------
// Candidate admission
// ---------------------------------------------------------------------------
test('candidates are held out of every default ranking and admitted only when asked for', () => {
  const matrix = loadMatrix();
  const candidateKeys = new Set(loadTopModels().models.filter((model) => model.admission === 'candidate').map((model) => model.key));
  for (const pair of Object.keys(matrix.resolution)) {
    for (const row of admittedModels(rankModels({ pair }))) {
      assert.ok(!candidateKeys.has(row.model), `${row.model} was admitted for ${pair} without --include-candidates`);
    }
  }

  const held = rankModels({ pair: 'S T2' }).filter((row) => candidateKeys.has(row.model));
  assert.ok(held.length > 0, 'candidates should still be reported, with a reason');
  for (const row of held) assert.match(row.excluded_reason, /--include-candidates/);

  const included = admittedModels(rankModels({ pair: 'S T2', includeCandidates: true }));
  assert.ok(included.some((row) => row.model === 'glm-5-3-flash'), 'GLM 5.3 Flash is an S-band candidate');
  assert.equal(included.find((row) => row.model === 'glm-5-3-flash').admission, 'candidate');
  assert.equal(included.find((row) => row.model === 'glm-5-3-flash').thinking_cost_index, 50);
});

test('a candidate is never admitted to a T4 pair, an independent-review seat or a review row', () => {
  const candidateKeys = new Set(loadTopModels().models.filter((model) => model.admission === 'candidate').map((model) => model.key));
  for (const pair of ['X T4', 'F T4', 'F T5']) {
    const ranked = rankModels({ pair, includeCandidates: true, explicitFable51: true });
    for (const row of ranked.filter((entry) => candidateKeys.has(entry.model))) {
      assert.equal(row.excluded_reason, 'candidate: not admitted for critical review', `${row.model} leaked into ${pair}`);
    }
    for (const row of admittedModels(ranked)) assert.ok(!candidateKeys.has(row.model));
  }

  const review = rankModels({ pair: 'S T2', includeCandidates: true, reviewSeat: true });
  for (const row of review.filter((entry) => candidateKeys.has(entry.model))) {
    assert.equal(row.excluded_reason, 'candidate: not admitted for critical review');
  }
  const independent = rankModels({ pair: 'S T2', includeCandidates: true, independentReview: true });
  for (const row of independent.filter((entry) => candidateKeys.has(entry.model))) {
    assert.equal(row.excluded_reason, 'candidate: not admitted for critical review');
  }
  assert.match(explain(review), /Candidates \(not admitted by default\)/);
});

test('an exposed candidate in the runtime inventory is admitted on S T2 but still not on X T4', () => {
  const inventory = {
    schema_version: 1,
    harness: 'opencode',
    models: [
      { id: 'glm-5-3-flash', provider: 'z.ai', efforts: ['default'], availability: 'exposed' },
      { id: 'mimo-v2.6-pro', provider: 'xiaomi', efforts: ['default'], availability: 'verified' },
      { id: 'gpt-5.6-terra', provider: 'openai', efforts: ['low', 'medium', 'high'], availability: 'verified' },
      { id: 'gpt-5.6-sol', provider: 'openai', efforts: ['medium', 'high'], availability: 'verified' },
    ],
  };
  const s2 = admittedModels(rankModels({ pair: 'S T2', inventory }));
  assert.ok(s2.some((row) => row.model === 'glm-5-3-flash'), 'exposure admits a candidate on a noncritical lane without the flag');

  const x2 = admittedModels(rankModels({ pair: 'X T2', inventory }));
  assert.ok(x2.some((row) => row.model === 'mimo-v2-6-pro'));

  const x4 = rankModels({ pair: 'X T4', inventory });
  assert.ok(!admittedModels(x4).some((row) => row.model === 'mimo-v2-6-pro'), 'exposure never buys a critical-review seat');
  assert.equal(x4.find((row) => row.model === 'mimo-v2-6-pro').excluded_reason, 'candidate: not admitted for critical review');
});

// ---------------------------------------------------------------------------
// cheapestThinkingFor()
// ---------------------------------------------------------------------------
test('cheapestThinkingFor buys the cheapest thinking within the score budget', () => {
  const w = cheapestThinkingFor('W T3');
  assert.equal(w.model, 'gpt-5-6-luna');
  assert.equal(w.effort, 'xhigh', 'Luna `high` is 3 points below the W T3 baseline — outside the default 2-point budget');
  assert.equal(w.max_score_loss, 2);
  assert.equal(w.score_loss, 0);
  assert.equal(w.thinking_cost_index, 18);

  const loose = cheapestThinkingFor('W T3', { maxScoreLoss: 5 });
  assert.equal(loose.effort, 'high', 'a 5-point budget reaches the cheaper Luna `high`');
  assert.ok(loose.est_usd_per_task < w.est_usd_per_task);

  const incumbentOnly = cheapestThinkingFor('S T3');
  assert.equal(incumbentOnly.model, 'gpt-5-6-terra');
  assert.equal(incumbentOnly.admission, 'incumbent');

  const withCandidates = cheapestThinkingFor('S T3', { includeCandidates: true });
  assert.equal(withCandidates.model, 'glm-5-3-flash');
  assert.equal(withCandidates.admission, 'candidate');
  assert.ok(withCandidates.est_usd_per_task < incumbentOnly.est_usd_per_task, 'the candidate must actually be cheaper than the incumbent it displaces');
  assert.match(explain(withCandidates), /Cheapest thinking for S T3/);

  assert.equal(cheapestThinkingFor('X T4', { includeCandidates: true }).admission, 'incumbent', 'no candidate at a T4 seat, cheap or not');
});

// ---------------------------------------------------------------------------
// estimateFlow()
// ---------------------------------------------------------------------------
test('a COMPLEX FEATURE flow fans out to at least 3 and always ends on a review phase', () => {
  const flow = estimateFlow('FEATURE', 'COMPLEX', 'openai');
  assert.equal(flow.fan_out_min, 3);
  const parallel = flow.phases.filter((phase) => phase.parallelizable);
  assert.ok(parallel.length > 0);
  for (const phase of parallel) assert.ok(phase.dispatches >= 3);
  const review = flow.phases.filter((phase) => phase.phase.includes('review'));
  assert.ok(review.length >= 1, 'no review phase in the FEATURE flow');
  assert.ok(flow.est_total_usd > 0);
  assert.ok(Array.isArray(flow.warnings));
  assert.match(explain(flow), /Tier histogram/);
});

test('every task flow phase resolves and the histogram is reported against the target band', () => {
  const matrix = loadMatrix();
  for (const type of Object.keys(matrix.task_flows)) {
    const flow = estimateFlow(type, 'MODERATE', 'openai');
    assert.equal(flow.phases.length, matrix.task_flows[type].phases.length);
    for (const tier of ['W', 'S', 'X', 'F']) {
      assert.deepEqual(flow.tier_histogram[tier].target_pct, matrix.target_distribution[tier]);
    }
  }
});

test('parsePair understands the W T0-T1 range key', () => {
  assert.deepEqual(parsePair('W T0-T1'), { tier: 'W', level: 'T1', low_level: 'T0', key: 'W T0-T1' });
  assert.throws(() => parsePair('Z T9'), /Not a tier\/thinking pair/);
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const CLI = `${root}bin/route.mjs`;

test('CLI prints parseable JSON for a classified dispatch', () => {
  const run = spawnSync(process.execPath, [CLI, '--task', 'BUG_FIX', '--phase', 'fix', '--area', 'refund', '--risk', 'critical', '--harness', 'codex', '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.pair, 'X T3');
  assert.equal(payload.review_floor, 'X T4');
  assert.equal(payload.independent_review, true);
  assert.equal(payload.ranked_models[0].model, 'gpt-5-6-sol');
});

test('CLI --flow estimates a whole flow and --list enumerates the vocabulary', () => {
  const flow = spawnSync(process.execPath, [CLI, '--task', 'FEATURE', '--flow', '--complexity', 'COMPLEX', '--provider', 'openai', '--json'], { encoding: 'utf8' });
  assert.equal(flow.status, 0, flow.stderr);
  assert.equal(JSON.parse(flow.stdout).fan_out_min, 3);

  const text = spawnSync(process.execPath, [CLI, '--task', 'INCIDENT', '--flow'], { encoding: 'utf8' });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Phases:/);

  const list = spawnSync(process.execPath, [CLI, '--list'], { encoding: 'utf8' });
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /Risk-floor areas:/);
});

test('CLI --list prints all 21 models with tier, admission and thinking levels', () => {
  const list = spawnSync(process.execPath, [CLI, '--list'], { encoding: 'utf8' });
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /Models \(21\) — key \| tier \| admission \| thinking levels:/);
  const rows = list.stdout.split('\n').filter((line) => /^ {2}[a-z0-9-]+ \| (W|S|X|F|—) \| (incumbent|candidate) \| /.test(line));
  assert.equal(rows.length, 21);
  assert.equal(rows.filter((line) => line.includes('| candidate |')).length, 10);
  assert.ok(rows.some((line) => line.startsWith('  glm-5-3-flash | S | candidate | default')));
});

test('CLI --include-candidates and --cheapest-thinking change the ranking, never the review seat', () => {
  const base = ['--task', 'FEATURE', '--phase', 'implementation', '--json'];
  const plain = JSON.parse(spawnSync(process.execPath, [CLI, ...base], { encoding: 'utf8' }).stdout);
  assert.ok(plain.ranked_models.filter((row) => !row.excluded_reason).every((row) => row.admission === 'incumbent'));

  const included = spawnSync(process.execPath, [CLI, ...base, '--include-candidates', '--cheapest-thinking'], { encoding: 'utf8' });
  assert.equal(included.status, 0, included.stderr);
  const payload = JSON.parse(included.stdout);
  assert.ok(payload.ranked_models.some((row) => row.admission === 'candidate' && !row.excluded_reason));
  assert.ok(payload.cheapest_thinking);
  assert.equal(payload.cheapest_thinking.max_score_loss, 2);

  const loose = JSON.parse(spawnSync(process.execPath, [CLI, ...base, '--include-candidates', '--cheapest-thinking', '--max-score-loss', '6'], { encoding: 'utf8' }).stdout);
  assert.equal(loose.cheapest_thinking.max_score_loss, 6);

  const critical = JSON.parse(spawnSync(process.execPath, [CLI, '--task', 'BUG_FIX', '--phase', 'fix', '--area', 'refund', '--risk', 'critical', '--include-candidates', '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(critical.review_floor, 'X T4');
  for (const row of critical.ranked_review_models.filter((entry) => entry.admission === 'candidate')) {
    assert.equal(row.excluded_reason, 'candidate: not admitted for critical review');
  }
  assert.ok(critical.ranked_review_models.filter((row) => !row.excluded_reason).every((row) => row.admission === 'incumbent'));
});

test('CLI exits 1 with usage on bad arguments', () => {
  for (const argv of [[], ['--task', 'NOPE', '--phase', 'fix'], ['--task', 'FEATURE'], ['--nonsense'], ['--task']]) {
    const run = spawnSync(process.execPath, [CLI, ...argv], { encoding: 'utf8' });
    assert.equal(run.status, 1, `expected exit 1 for ${JSON.stringify(argv)}`);
    assert.match(run.stderr, /Usage: route\.mjs/);
  }
});

test('Claude Opus 5.5 succeeds Opus 5 on price, with Opus 5 as the fallback', () => {
  // X T3 on Claude: Opus 5.5 has no measured `high` point, Opus 5 does. Cost
  // ranking alone would keep Opus 5; succession puts 5.5 first because every
  // per-token price is at or below Opus 5's — and says so, without estimating.
  const rows = admittedModels(rankModels({ pair: 'X T3', provider: 'anthropic' }));
  assert.equal(rows[0].model, 'claude-opus-5-5');
  assert.equal(rows[0].effort, 'high');
  assert.equal(rows[0].est_usd_per_task, null, 'an unmeasured effort must not borrow a $/task');
  assert.ok(rows[0].cap_notes.some((note) => note.includes('succeeds claude-opus-5')));
  assert.equal(rows[1].model, 'claude-opus-5', 'Opus 5 must stay directly behind as the fallback');
  assert.equal(rows[1].est_usd_per_task, 3.61);

  // A harness that does not expose Opus 5.5 falls back to Opus 5, measured.
  const inventory = { models: [{ id: 'claude-opus-5', efforts: ['high', 'xhigh'], availability: 'exposed' }] };
  const fallback = admittedModels(rankModels({ pair: 'X T3', provider: 'anthropic', inventory }));
  assert.equal(fallback[0].model, 'claude-opus-5');
  assert.equal(fallback[0].est_usd_per_task, 3.61);
});
