// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
/**
 * Per-shard cost-aware model selection: every shard is routed on its own, at
 * dispatch time, against the live inventory. These tests pin the four
 * properties that make that real rather than advisory.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SHARD_ROUTING_FIELDS, buildShardRouting, buildShardContracts, rerouteRemaining } from '../lib/dispatch-contract.mjs';

/** A FEATURE COMPLEX flow: one shard per phase, each with its own role. */
const featureFlow = {
  task_id: 'task-1',
  task_type: 'FEATURE',
  complexity: 'COMPLEX',
  harness: 'claude',
  plan_shards: [
    { shard_id: 'plan.design', phase: 'plan', agent: 'orchestrator', status: 'pending' },
    { shard_id: 'red.tests', phase: 'tdd', agent: 'test-engineer', status: 'pending' },
    { shard_id: 'build.api', phase: 'implementation', agent: 'backend-fixer', status: 'pending' },
    { shard_id: 'build.ui', phase: 'implementation', agent: 'frontend-fixer', status: 'pending' },
    { shard_id: 'mechanical.rename', phase: 'mechanical', agent: 'explore', status: 'pending' },
    { shard_id: 'review.diff', phase: 'review', agent: 'code-reviewer', status: 'pending' },
  ],
};

test('a FEATURE COMPLEX flow routes every shard separately, each with a full routing block', () => {
  const routed = buildShardContracts(featureFlow, { inventory: null, harness: 'claude' });
  assert.equal(routed.shards.length, featureFlow.plan_shards.length);

  for (const entry of routed.shards) {
    for (const field of SHARD_ROUTING_FIELDS) {
      assert.ok(field in entry.routing, `${entry.shard_id} is missing routing.${field}`);
    }
    assert.ok(entry.routing.selection_reason.length > 0, `${entry.shard_id} has an empty selection_reason`);
    assert.ok(entry.routing.price_source.includes('Artificial Analysis'), 'price_source must carry dated provenance');
  }

  // The ledger is a real ledger: histogram, mean cost, warnings.
  assert.equal(routed.ledger.dispatches, 6);
  assert.deepEqual(Object.keys(routed.ledger.tier_histogram), ['W', 'S', 'X', 'F']);
  assert.ok(Array.isArray(routed.ledger.warnings));
  assert.ok(routed.ledger.flow_estimate, 'the ledger reuses estimateFlow for the reference estimate');
  assert.equal(routed.ledger.flow_estimate.task_type, 'FEATURE');
});

test('two shards with different roles resolve to different pairs', () => {
  const mechanical = buildShardRouting({ shard_id: 'm', task_type: 'FEATURE', phase: 'mechanical', agent: 'explore' }, { harness: 'claude' });
  const plan = buildShardRouting({ shard_id: 'p', task_type: 'FEATURE', phase: 'plan', agent: 'orchestrator' }, { harness: 'claude' });

  assert.notEqual(mechanical.pair, plan.pair);
  assert.equal(mechanical.tier, 'W');
  assert.equal(plan.tier, 'S');
  assert.notEqual(mechanical.model_requested, plan.model_requested);

  // One pair for the whole flow would be a routing failure: the flow must show spread.
  const routed = buildShardContracts(featureFlow, { harness: 'claude' });
  const pairs = new Set(routed.shards.map((entry) => entry.routing.pair));
  assert.ok(pairs.size > 1, 'a COMPLEX flow that resolves to a single pair has not been routed per shard');
});

test('an inventory without Opus resolves an X-tier shard to the next eligible exposed model', () => {
  // Anthropic-only inventory that exposes Sonnet but not Opus/Fable.
  const withoutOpus = {
    revision: 11,
    models: [
      { id: 'claude-sonnet-5', availability: 'exposed', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { id: 'gpt-5.6-sol', availability: 'exposed', efforts: ['low', 'medium', 'high'] },
    ],
  };
  const shard = { shard_id: 'fix.refund', task_type: 'BUG_FIX', phase: 'fix', area: 'refund', agent: 'backend-fixer' };

  const routed = buildShardRouting(shard, { inventory: withoutOpus, inventoryRevision: 11 });
  assert.equal(routed.tier, 'X', 'the risk floor keeps this shard on X');
  assert.equal(routed.blocked, null);
  assert.equal(routed.model_effective, 'gpt-5.6-sol', 'the next eligible exposed X model takes the seat');
  assert.equal(routed.inventory_revision, 11);
  assert.match(routed.selection_reason, /not available in this inventory/);

  // Nothing eligible at all → blocked, never a quieter tier.
  const emptyInventory = { revision: 12, models: [{ id: 'claude-haiku-4-5', availability: 'exposed', efforts: ['disabled', 'enabled'] }] };
  const blocked = buildShardRouting(shard, { inventory: emptyInventory, inventoryRevision: 12 });
  assert.equal(blocked.tier, 'X', 'the tier floor is never lowered to fit an inventory');
  assert.equal(blocked.model_effective, null);
  assert.equal(blocked.blocked, 'no eligible model');
  assert.match(blocked.selection_reason, /never lowered/);
});

test('rerouteRemaining changes only pending shards', () => {
  const started = buildShardContracts(featureFlow, { harness: 'claude', inventoryRevision: 1 });
  const inFlight = {
    ...featureFlow,
    plan_shards: featureFlow.plan_shards.map((shard, index) => ({
      ...shard,
      status: index < 2 ? 'done' : index === 2 ? 'running' : 'pending',
      routing: started.shards[index].routing,
    })),
  };

  const newInventory = {
    revision: 2,
    models: [{ id: 'gpt-5.6-terra', availability: 'exposed', efforts: ['low', 'medium', 'high'] }, { id: 'gpt-5.6-luna', availability: 'exposed', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] }],
  };
  const rerouted = rerouteRemaining(inFlight, newInventory, { harness: 'codex' });

  assert.deepEqual(rerouted.rerouted_shard_ids, ['build.ui', 'mechanical.rename', 'review.diff']);
  for (const entry of rerouted.shards) {
    if (entry.rerouted) {
      assert.equal(entry.routing.inventory_revision, 2);
      assert.equal(entry.routing.model_effective?.startsWith('gpt-'), true, 'a re-routed shard uses the new inventory');
    } else {
      assert.equal(entry.routing.inventory_revision, 1, 'a finished or in-flight shard keeps the routing it was dispatched with');
    }
  }
});

test('a dispatch contract can carry the shard routing block', () => {
  const capabilityPlan = {
    required: [{ id: 'shell.rtk', level: 'required', scope: 'phase', acceptance: ['command-exit-status'], status: 'satisfied' }],
    optional: [],
    bindings: { 'shell.rtk': { capability: 'shell.rtk', implementation: 'rtk', kind: 'cli', source: 'project-callable', permission: 'read_only', evidence: ['--version'] } },
    fallback_plan: [],
    available_tools: [],
  };
  const contract = buildShardContracts({ ...featureFlow, capability_plan: capabilityPlan }, { harness: 'claude' });
  const first = contract.shards[0];
  assert.ok(first.contract, 'a capability plan produces a full child contract');
  assert.deepEqual(first.contract.routing, first.routing, 'the contract carries the same routing block as the shard');
});
