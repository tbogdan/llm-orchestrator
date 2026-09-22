import { discoverTools } from '../lib/tool-discovery.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCapabilities } from '../lib/capability-resolver.mjs';
import { discoverProject } from '../lib/project-discovery.mjs';

const profile = {
  facts: [{ id: 'web-ui', value: true, evidence: ['package.json'], confidence: 'high' }],
  languages: ['JavaScript'],
  frameworks: ['Vue'],
  domains: [],
  commands: []
};

const baseTask = {
  type: 'feature',
  signals: ['web-ui'],
  requires_shell: true,
  nontrivial: true,
  acceptance: ['rendered-ui-acceptance']
};

function tool(id, kind, capabilities, overrides = {}) {
  return {
    id,
    kind,
    capabilities,
    scope: 'project',
    source: 'fixture',
    status: 'callable',
    permission: 'read_only',
    evidence: ['fixture'],
    limitations: [],
    ...overrides
  };
}

test('prefers an explicit user binding over a callable project equivalent', () => {
  const plan = resolveCapabilities({
    profile,
    task: baseTask,
    phase: 'verification',
    role: 'builder',
    inventory: { revision: 7, entries: [
      tool('project-browser', 'native_tool', ['browser.interact', 'browser.capture']),
      tool('user-browser', 'native_tool', ['browser.interact', 'browser.capture'], { scope: 'user' })
    ] },
    decisions: [{ capability: 'browser.interact', binding: 'user-browser', source: 'user' }]
  });

  assert.equal(plan.bindings['browser.interact'].implementation, 'user-browser');
  assert.equal(plan.bindings['browser.interact'].source, 'user');
});

test('prefers an explicit project binding before another project callable equivalent', () => {
  const plan = resolveCapabilities({
    profile: { ...profile, bindings: { 'browser.interact': 'project-browser-chosen' } },
    task: baseTask,
    phase: 'verification',
    role: 'builder',
    inventory: { revision: 7, entries: [
      tool('project-browser-default', 'native_tool', ['browser.interact', 'browser.capture']),
      tool('project-browser-chosen', 'native_tool', ['browser.interact', 'browser.capture'])
    ] },
    decisions: []
  });

  assert.equal(plan.bindings['browser.interact'].implementation, 'project-browser-chosen');
  assert.equal(plan.bindings['browser.interact'].source, 'project-binding');
});

test('rejects an explicit capture-only binding for an interaction capability', () => {
  const plan = resolveCapabilities({
    profile: { ...profile, bindings: { 'browser.interact': 'capture-only' } },
    task: baseTask,
    phase: 'verification',
    role: 'verifier',
    inventory: { revision: 1, entries: [tool('capture-only', 'native_tool', ['browser.capture'])] },
    decisions: []
  });

  assert.equal(plan.bindings['browser.interact'], undefined);
  assert.ok(plan.unverified_acceptance.includes('rendered-ui-acceptance'));
});

test('keeps a callable project equivalent while recommending a missing optional preferred tool', () => {
  const plan = resolveCapabilities({
    profile: { ...profile, domains: ['research'] },
    task: { type: 'research', signals: ['external-facts'] },
    phase: 'investigation',
    role: 'researcher',
    inventory: { revision: 1, entries: [
      tool('native-web', 'native_tool', ['research.retrieve', 'research.provenance'])
    ] },
    decisions: []
  });

  assert.equal(plan.bindings['research.retrieve'].implementation, 'native-web');
  assert.ok(plan.optional.some(requirement => requirement.id === 'research.validation'));
  assert.ok(plan.recommendations.some(recommendation => recommendation.implementation === 'exa-search'));
});

test('does not mark acceptance unverified when only an optional browser capture is absent', () => {
  const plan = resolveCapabilities({
    profile,
    task: baseTask,
    phase: 'verification',
    role: 'verifier',
    inventory: { revision: 1, entries: [
      tool('browser', 'native_tool', ['browser.inspect', 'browser.interact'])
    ] },
    decisions: []
  });

  assert.ok(plan.optional.some(item => item.id === 'browser.capture' && item.status === 'missing'));
  assert.ok(!plan.unverified_acceptance.includes('rendered-ui-acceptance'));
});

test('uses a native fallback after an installation is declined without repeating the recommendation', () => {
  const plan = resolveCapabilities({
    profile,
    task: { type: 'feature', nontrivial: true },
    phase: 'planning',
    role: 'planner',
    inventory: { revision: 3, entries: [
      tool('native-decision-checkpoints', 'native_tool', ['reasoning.checkpoints'])
    ] },
    decisions: [{ capability: 'reasoning.checkpoints', installation: 'declined' }]
  });

  assert.equal(plan.bindings['reasoning.checkpoints'].implementation, 'native-decision-checkpoints');
  assert.equal(plan.bindings['reasoning.checkpoints'].source, 'declined-fallback');
  assert.equal(plan.recommendations.filter(item => item.capability === 'reasoning.checkpoints').length, 0);
  assert.equal(plan.degraded, true);
  assert.deepEqual(plan.prohibited_operations, []);
});

test('uses an evidence-required manual decision checkpoint after Sequential Thinking is declined', () => {
  const plan = resolveCapabilities({
    profile,
    task: { type: 'FEATURE', nontrivial: true },
    phase: 'planning',
    role: 'planner',
    inventory: { revision: 1, entries: [] },
    decisions: [{ capability: 'reasoning.checkpoints', installation: 'declined' }]
  });

  assert.equal(plan.bindings['reasoning.checkpoints'].kind, 'manual');
  assert.equal(plan.bindings['reasoning.checkpoints'].implementation, 'manual-decision-checkpoints');
  assert.equal(plan.bindings['reasoning.checkpoints'].source, 'declined-manual-fallback');
  assert.equal(plan.degraded, true);
  assert.equal(plan.recommendations.filter(item => item.capability === 'reasoning.checkpoints').length, 0);
});

test('keeps an unknown core MCP as a missing recommendation until access is proven', () => {
  const plan = resolveCapabilities({
    profile,
    task: { type: 'feature', nontrivial: true },
    phase: 'planning',
    role: 'planner',
    inventory: { revision: 3, entries: [
      tool('sequential-thinking', 'mcp', ['reasoning.checkpoints'], { status: 'unknown', permission: 'unknown' })
    ] },
    decisions: []
  });

  assert.equal(plan.bindings['reasoning.checkpoints'], undefined);
  assert.ok(plan.recommendations.some(item => item.implementation === 'sequential-thinking'));
  assert.ok(plan.unverified_acceptance.includes('decision-evidence-checkpoint'));
});

test('recognizes a capability-evidenced Sequential Thinking runtime alias without treating the preferred name as missing', () => {
  const plan = resolveCapabilities({
    profile,
    task: { type: 'FEATURE', nontrivial: true },
    phase: 'planning',
    role: 'planner',
    inventory: { revision: 3, entries: [tool('sequentialthinking', 'mcp', ['reasoning.checkpoints'], { scope: 'user' })] },
    decisions: []
  });

  assert.equal(plan.bindings['reasoning.checkpoints'].implementation, 'sequentialthinking');
  assert.ok(!plan.recommendations.some(item => item.implementation === 'sequential-thinking'));
});

test('recommends the concrete Superpowers product for a missing workflow suite', () => {
  const plan = resolveCapabilities({
    profile,
    task: { type: 'FEATURE' },
    phase: 'planning',
    role: 'planner',
    inventory: { revision: 3, entries: [] },
    decisions: []
  });
  const workflowGap = plan.recommendations.find(item => item.implementation === 'superpowers-workflows');

  assert.equal(workflowGap.recommendation_kind, 'product');
  assert.equal(workflowGap.display_name, 'Superpowers');
  assert.equal(workflowGap.installable, true);
});

test('does not activate a billing provider requirement from a Stripe keyword without project evidence', () => {
  const plan = resolveCapabilities({
    profile: { ...profile, domains: [] },
    task: { type: 'documentation', signals: ['stripe', 'provider-state'] },
    phase: 'investigation',
    role: 'researcher',
    inventory: { revision: 1, entries: [] },
    decisions: []
  });

  assert.ok(!plan.required.some(item => item.id === 'billing.provider_evidence'));
  assert.ok(!plan.recommendations.some(item => item.capability === 'billing.provider_evidence'));
});

test('activates critical billing review from discovered Stripe project evidence without requiring live provider access', async () => {
  const discovered = await discoverProject({
    root: '/fixture',
    listFiles: async () => ['package.json'],
    readText: async () => JSON.stringify({ dependencies: { stripe: '^1.0.0' } })
  });
  const plan = resolveCapabilities({
    profile: discovered,
    task: { type: 'FEATURE', signals: ['stripe'] },
    phase: 'review',
    role: 'reviewer',
    inventory: { revision: 1, entries: [] },
    decisions: []
  });

  assert.ok(discovered.domains.includes('stripe'));
  assert.ok(plan.required.some(item => item.id === 'review.independent'));
  assert.ok(!plan.required.some(item => item.id === 'billing.provider_evidence'));
});

test('does not require executable behavioral tooling during a feature planning phase', () => {
  const plan = resolveCapabilities({
    profile,
    task: { type: 'FEATURE', nontrivial: true },
    phase: 'planning',
    role: 'planner',
    inventory: { revision: 1, entries: [] },
    decisions: []
  });

  assert.ok(plan.required.some(item => item.id === 'workflow.plan'));
  assert.ok(!plan.required.some(item => item.id === 'test.behavioral'));
});

test('requires current documentation for version-sensitive feature work', () => {
  const plan = resolveCapabilities({
    profile,
    task: { type: 'FEATURE', signals: ['version-sensitive'] },
    phase: 'planning',
    role: 'planner',
    inventory: { revision: 1, entries: [] },
    decisions: []
  });

  assert.ok(plan.mandatory.some(item => item.id === 'docs.current'));
});

test('preserves an explicit project risk-floor capability for protocol task labels', () => {
  const plan = resolveCapabilities({
    profile: {
      ...profile,
      required_capabilities: [{ id: 'review.independent', scope: 'role', reason: 'project risk floor', acceptance: ['independent-review'] }]
    },
    task: { type: 'INVESTIGATION' },
    phase: 'review',
    role: 'reviewer',
    inventory: { revision: 1, entries: [tool('independent-reviewer', 'agent_role', ['review.independent'])] },
    decisions: []
  });

  assert.equal(plan.bindings['review.independent'].implementation, 'independent-reviewer');
  assert.ok(plan.required.some(item => item.id === 'review.independent'));
  assert.ok(plan.required.find(item => item.id === 'review.independent').provenance.includes('project-profile'));
});

test('scopes deployment prechecks and smoke checks to their distinct phases', () => {
  const common = {
    profile,
    task: { type: 'DEPLOY', signals: ['deploy'] },
    role: 'deployer',
    inventory: { revision: 1, entries: [] },
    decisions: []
  };
  const planning = resolveCapabilities({ ...common, phase: 'planning' });
  const precheck = resolveCapabilities({ ...common, phase: 'precheck' });

  assert.ok(planning.required.some(item => item.id === 'deployment.rollback'));
  assert.ok(!planning.required.some(item => item.id === 'deployment.precheck'));
  assert.ok(precheck.required.some(item => item.id === 'deployment.precheck'));
  assert.ok(!precheck.required.some(item => item.id === 'deployment.smoke'));
});

test('activates deployment requirements from the protocol DEPLOY type without a redundant signal', () => {
  const plan = resolveCapabilities({
    profile,
    task: { type: 'DEPLOY' },
    phase: 'precheck',
    role: 'deployer',
    inventory: { revision: 1, entries: [] },
    decisions: []
  });

  assert.ok(plan.required.some(item => item.id === 'deployment.precheck'));
});

test('marks rendered acceptance unverified when browser interaction is unavailable', () => {
  const plan = resolveCapabilities({
    profile,
    task: baseTask,
    phase: 'verification',
    role: 'verifier',
    inventory: { revision: 1, entries: [] },
    decisions: []
  });

  assert.ok(plan.unverified_acceptance.includes('rendered-ui-acceptance'));
  assert.ok(plan.recommendations.some(item => item.capability === 'browser.interact'));
});

test('does not bypass a denied operation through another matching tool', () => {
  const plan = resolveCapabilities({
    profile,
    task: baseTask,
    phase: 'verification',
    role: 'verifier',
    inventory: { revision: 1, entries: [
      tool('browser-denied', 'native_tool', ['browser.interact'], { status: 'denied', permission: 'denied', operation_denied: true }),
      tool('another-browser', 'native_tool', ['browser.interact', 'browser.capture'])
    ] },
    decisions: []
  });

  assert.equal(plan.bindings['browser.interact'], undefined);
  assert.ok(plan.prohibited_operations.some(item => item.capability === 'browser.interact'));
  assert.ok(plan.unverified_acceptance.includes('rendered-ui-acceptance'));
});

test('does not recommend iOS tooling for an Android-only native task', () => {
  const plan = resolveCapabilities({
    profile: { ...profile, domains: ['mobile'] },
    task: { type: 'feature', signals: ['android', 'mobile-native'], acceptance: ['native-platform-evidence'] },
    phase: 'verification',
    role: 'verifier',
    inventory: { revision: 1, entries: [] },
    decisions: []
  });

  assert.ok(plan.recommendations.some(item => item.implementation === 'android-performance'));
  assert.ok(!plan.recommendations.some(item => item.implementation === 'ios-debugger-agent'));
});

test('runtime discovery preserves operation denial across aliases and equivalent tools', async () => {
  for (const denial of [{operation_denied: true}, {denied_capabilities: ['browser.interact']}]) {
    const inventory = await discoverTools({harness: 'claude-code', runtimeInventory: [
      tool('browser-a', 'native_tool', ['browser.interact'], {...denial, aliases: ['browser-alias']}),
      tool('browser-alias', 'native_tool', ['browser.interact']),
      tool('browser-b', 'native_tool', ['browser.interact'])
    ]});
    const plan = resolveCapabilities({profile, task: baseTask, phase: 'verification', role: 'builder', inventory});
    assert.equal(plan.bindings['browser.interact'], undefined);
    assert.ok(plan.prohibited_operations.length > 0);
  }
});

test('loaded Superpowers alias avoids a redundant installation suggestion', () => {
  const plan = resolveCapabilities({profile, task: {type: 'documentation'}, phase: 'verification', role: 'builder', inventory: {entries: [tool('superpowers', 'workflow', ['workflow.selection'], {status: 'loaded'})]}});
  assert.equal(plan.required.find(item => item.id === 'workflow.selection').status, 'satisfied');
  assert.ok(!plan.recommendations.some(item => item.capability === 'workflow.selection'));
});
