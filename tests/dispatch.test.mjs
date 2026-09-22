import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDispatchContract, validateDispatchEvidence } from '../lib/dispatch-contract.mjs';

const capabilityPlan = {
  required: [
    { id: 'browser.interact', level: 'required', scope: 'phase', acceptance: ['rendered-ui-acceptance'], status: 'satisfied' },
    { id: 'shell.rtk', level: 'required', scope: 'phase', acceptance: ['command-exit-status'], status: 'satisfied' },
    { id: 'review.independent', level: 'required', scope: 'role', acceptance: ['independent-review'], status: 'satisfied' }
  ],
  optional: [{ id: 'browser.capture', level: 'optional', scope: 'phase', acceptance: [], status: 'missing' }],
  bindings: {
    'browser.interact': { capability: 'browser.interact', implementation: 'playwright', kind: 'mcp', source: 'project-callable', permission: 'read_only', evidence: ['schema'] },
    'shell.rtk': { capability: 'shell.rtk', implementation: 'rtk', kind: 'cli', source: 'project-callable', permission: 'read_only', evidence: ['--version'] },
    'review.independent': { capability: 'review.independent', implementation: 'independent-reviewer', kind: 'agent_role', source: 'project-binding', permission: 'read_only', evidence: ['assignment'] }
  },
  fallback_plan: [{ capability: 'browser.capture', implementation: 'manual-screenshot', reason: 'declined-installation' }],
  inventory_ref: 'inventory:fixture',
  available_tools: [
    { id: 'playwright', kind: 'mcp', capabilities: ['browser.interact'] },
    { id: 'rtk', kind: 'cli', capabilities: ['shell.rtk'] },
    { id: 'unrelated-provider', kind: 'mcp', capabilities: ['billing.provider_evidence'] }
  ]
};

const shard = {
  id: 'ui-verification',
  ownership: ['tests/ui'],
  acceptance: ['rendered-ui-acceptance', 'command-exit-status', 'independent-review'],
  parent_agent_id: 'parent-agent',
  child_agent_id: 'child-agent'
};

test('renders typed compatibility fields without classifying MCPs or roles as skills', () => {
  const contract = buildDispatchContract({
    capabilityPlan,
    shard,
    projectEvidence: [{ fact: 'web-ui', evidence: ['package.json'] }],
    inventoryRevision: 2
  });

  assert.equal(contract.inventory_revision, 2);
  assert.deepEqual(contract.required_mcps, ['playwright']);
  assert.deepEqual(contract.required_skills, []);
  assert.deepEqual(contract.required_workflows, []);
  assert.deepEqual(contract.required_cli_tools, ['rtk']);
  assert.equal(contract.bindings['review.independent'].kind, 'agent_role');
  assert.ok(contract.optional_capabilities.every(item => !contract.required_mcps.includes(item.id)));
  assert.deepEqual(contract.available_tools.map(item => item.id), ['playwright', 'rtk']);
});

test('narrows a child contract to the capabilities owned by its shard', () => {
  const contract = buildDispatchContract({
    capabilityPlan,
    shard: { ...shard, capability_ids: ['shell.rtk'] },
    projectEvidence: [],
    inventoryRevision: 2
  });

  assert.deepEqual(contract.required_capabilities.map(item => item.id), ['shell.rtk']);
  assert.deepEqual(contract.required_cli_tools, ['rtk']);
  assert.deepEqual(contract.required_mcps, []);
  assert.equal(contract.rtk_preflight.required, true);
});

test('requires concrete browser evidence rather than an unrun boolean flag', () => {
  const contract = buildDispatchContract({ capabilityPlan, shard, projectEvidence: [], inventoryRevision: 2 });
  const verdict = validateDispatchEvidence({
    contract,
    report: {
      used_capabilities: ['browser.interact', 'shell.rtk', 'review.independent'],
      used_mcps: ['playwright'],
      tool_calls: [{ tool: 'playwright', capability: 'browser.interact' }, { tool: 'rtk', capability: 'shell.rtk' }],
      loaded_skills: [],
      loaded_workflows: [],
      acceptance_evidence: [
        { id: 'command-exit-status', command: 'rtk node --test', exit_code: 0 },
        { id: 'independent-review', reviewer: 'reviewer-agent', type: 'independent-review', artifact: 'artifacts/review.json' }
      ],
      agent_role_invocations: [{ id: 'independent-reviewer', capability: 'review.independent', agent_id: 'reviewer-agent', artifact: 'artifacts/review.json' }],
      effective_permissions: { playwright: 'read_only', rtk: 'read_only', 'independent-reviewer': 'read_only' },
      substitutions: [{ capability: 'browser.capture', implementation: 'manual-screenshot' }],
      browser_check_ran: false
    },
    parentEvidence: { acceptance_evidence: [{ id: 'command-exit-status', command: 'rtk node --test', exit_code: 0 }, { id: 'independent-review', type: 'independent-review', artifact: 'artifacts/review.json' }] }
  });

  assert.equal(verdict.passed, false);
  assert.ok(verdict.unverified.includes('rendered-ui-acceptance'));
});

test('accepts evidence-bearing checks and rejects changed child permissions', () => {
  const contract = buildDispatchContract({ capabilityPlan, shard, projectEvidence: [], inventoryRevision: 2 });
  const verified = validateDispatchEvidence({
    contract,
    report: {
      used_capabilities: ['browser.interact', 'shell.rtk', 'review.independent'],
      used_mcps: ['playwright'],
      tool_calls: [{ tool: 'playwright', capability: 'browser.interact' }, { tool: 'rtk', capability: 'shell.rtk' }],
      loaded_skills: [],
      loaded_workflows: [],
      acceptance_evidence: [
        { id: 'rendered-ui-acceptance', screenshot: 'artifacts/ui.png', route: '/event', viewport: '390x844' },
        { id: 'command-exit-status', command: 'rtk node --test', exit_code: 0 },
        { id: 'independent-review', reviewer: 'reviewer-agent', type: 'independent-review', artifact: 'artifacts/review.json' }
      ],
      agent_role_invocations: [{ id: 'independent-reviewer', capability: 'review.independent', agent_id: 'reviewer-agent', artifact: 'artifacts/review.json' }],
      effective_permissions: { playwright: 'read_only', rtk: 'read_only', 'independent-reviewer': 'read_only' },
      substitutions: [{ capability: 'browser.capture', implementation: 'manual-screenshot' }]
    },
    parentEvidence: { acceptance_evidence: [
      { id: 'rendered-ui-acceptance', screenshot: 'artifacts/ui.png', route: '/event', viewport: '390x844' },
      { id: 'command-exit-status', command: 'rtk node --test', exit_code: 0 },
      { id: 'independent-review', type: 'independent-review', artifact: 'artifacts/review.json' }
    ] }
  });
  assert.deepEqual(verified, { passed: true, missing: [], unverified: [] });

  const changedPermission = validateDispatchEvidence({
    contract,
    report: {
      used_capabilities: ['browser.interact', 'shell.rtk', 'review.independent'],
      used_mcps: ['playwright'],
      tool_calls: [{ tool: 'playwright', capability: 'browser.interact' }, { tool: 'rtk', capability: 'shell.rtk' }],
      acceptance_evidence: [
        { id: 'rendered-ui-acceptance', screenshot: 'artifacts/ui.png' },
        { id: 'command-exit-status', command: 'rtk node --test', exit_code: 0 },
        { id: 'independent-review', reviewer: 'reviewer-agent', type: 'independent-review', artifact: 'artifacts/review.json' }
      ],
      agent_role_invocations: [{ id: 'independent-reviewer', capability: 'review.independent', agent_id: 'reviewer-agent', artifact: 'artifacts/review.json' }],
      effective_permissions: { playwright: 'denied', rtk: 'read_only', 'independent-reviewer': 'read_only' },
      substitutions: [{ capability: 'browser.capture', implementation: 'manual-screenshot' }]
    },
    parentEvidence: { acceptance_evidence: [
      { id: 'rendered-ui-acceptance', screenshot: 'artifacts/ui.png', route: '/event', viewport: '390x844' },
      { id: 'command-exit-status', command: 'rtk node --test', exit_code: 0 },
      { id: 'independent-review', type: 'independent-review', artifact: 'artifacts/review.json' }
    ] }
  });
  assert.ok(changedPermission.missing.includes('browser.interact:permission-changed'));
});

test('rejects a child self-review and summary-only review evidence', () => {
  const contract = buildDispatchContract({ capabilityPlan, shard, projectEvidence: [], inventoryRevision: 2 });
  const verdict = validateDispatchEvidence({
    contract,
    report: {
      used_capabilities: ['browser.interact', 'shell.rtk', 'review.independent'],
      used_mcps: ['playwright'],
      tool_calls: [{ tool: 'playwright', capability: 'browser.interact' }, { tool: 'rtk', capability: 'shell.rtk' }],
      acceptance_evidence: [
        { id: 'rendered-ui-acceptance', screenshot: 'artifacts/ui.png', route: '/event', viewport: '390x844' },
        { id: 'command-exit-status', command: 'rtk node --test', exit_code: 0 },
        { id: 'independent-review', reviewer: 'child-agent', summary: 'looks good' }
      ],
      effective_permissions: { playwright: 'read_only', rtk: 'read_only', 'independent-reviewer': 'read_only' },
      substitutions: [{ capability: 'browser.capture', implementation: 'manual-screenshot' }]
    },
    parentEvidence: { acceptance_evidence: [{ id: 'rendered-ui-acceptance', screenshot: 'artifacts/ui.png', route: '/event', viewport: '390x844' }, { id: 'command-exit-status', command: 'rtk node --test', exit_code: 0 }, { id: 'independent-review', type: 'independent-review', artifact: 'artifacts/review.json' }] }
  });

  assert.ok(verdict.missing.includes('review.independent:not-used'));
  assert.ok(verdict.unverified.includes('independent-review'));
});

test('requires parent-observed evidence before a final pass', () => {
  const contract = buildDispatchContract({ capabilityPlan, shard, projectEvidence: [], inventoryRevision: 2 });
  const verdict = validateDispatchEvidence({
    contract,
    report: {
      used_capabilities: ['browser.interact', 'shell.rtk', 'review.independent'],
      used_mcps: ['playwright'],
      tool_calls: [{ tool: 'playwright', capability: 'browser.interact' }, { tool: 'rtk', capability: 'shell.rtk' }],
      acceptance_evidence: [
        { id: 'rendered-ui-acceptance', screenshot: 'artifacts/ui.png', route: '/event', viewport: '390x844' },
        { id: 'command-exit-status', command: 'rtk node --test', exit_code: 0 },
        { id: 'independent-review', reviewer: 'reviewer-agent', type: 'independent-review', artifact: 'artifacts/review.json' }
      ],
      agent_role_invocations: [{ id: 'independent-reviewer', capability: 'review.independent', agent_id: 'reviewer-agent', artifact: 'artifacts/review.json' }],
      effective_permissions: { playwright: 'read_only', rtk: 'read_only', 'independent-reviewer': 'read_only' },
      substitutions: [{ capability: 'browser.capture', implementation: 'manual-screenshot' }]
    }
  });

  assert.equal(verdict.passed, false);
  assert.ok(verdict.missing.includes('parent-evidence-not-observed'));
});

test('accepts an evidence-bearing manual fallback without treating it as a tool call', () => {
  const manualPlan = {
    required: [{ id: 'reasoning.checkpoints', level: 'required', scope: 'phase', acceptance: ['decision-evidence-checkpoint'], status: 'satisfied' }],
    optional: [],
    bindings: {
      'reasoning.checkpoints': { capability: 'reasoning.checkpoints', implementation: 'manual-decision-checkpoints', kind: 'manual', source: 'declined-manual-fallback', permission: 'read_only', evidence: [] }
    },
    fallback_plan: [{ capability: 'reasoning.checkpoints', implementation: 'manual-decision-checkpoints', reason: 'declined-installation' }]
  };
  const contract = buildDispatchContract({ capabilityPlan: manualPlan, shard: { id: 'plan', ownership: [], acceptance: ['decision-evidence-checkpoint'] }, projectEvidence: [], inventoryRevision: 2 });
  const report = {
    used_capabilities: ['reasoning.checkpoints'],
    acceptance_evidence: [{ id: 'decision-evidence-checkpoint', artifact: 'artifacts/decision.md' }],
    effective_permissions: { 'manual-decision-checkpoints': 'read_only' },
    substitutions: [{ capability: 'reasoning.checkpoints', implementation: 'manual-decision-checkpoints' }]
  };

  assert.deepEqual(validateDispatchEvidence({ contract, report, parentEvidence: { acceptance_evidence: [{ id: 'decision-evidence-checkpoint', artifact: 'artifacts/decision.md' }] } }), { passed: true, missing: [], unverified: [] });
});

test('rejects empty and unknown explicit child capability selections', () => {
  assert.throws(() => buildDispatchContract({ capabilityPlan, shard: { ...shard, capability_ids: [] }, projectEvidence: [], inventoryRevision: 2 }), /cannot be empty/);
  assert.throws(() => buildDispatchContract({ capabilityPlan, shard: { ...shard, capability_ids: ['unknown.capability'] }, projectEvidence: [], inventoryRevision: 2 }), /not in the capability plan/);
});

test('narrowed shards retain inherited core fallback evidence obligations', () => {
  const core = {id: 'reasoning.checkpoints', level: 'required', scope: 'core', acceptance: [], status: 'degraded'};
  const fallback = {capability: core.id, implementation: 'manual', reason: 'declined-installation'};
  const contract = buildDispatchContract({capabilityPlan: {...capabilityPlan, required: [...capabilityPlan.required, core], fallback_plan: [fallback]}, shard: {...shard, capability_ids: ['browser.interact']}});
  assert.ok(contract.required_capabilities.some(item => item.id === core.id));
  assert.deepEqual(contract.fallback_plan, [fallback]);
});
