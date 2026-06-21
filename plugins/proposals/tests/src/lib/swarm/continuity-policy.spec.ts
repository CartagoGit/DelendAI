/**
 * continuity-policy.spec.ts
 *
 * TDD specs for evaluateContinuityPolicy (p34b T1 point 2).
 * Mirrors the structure and approach of proposal-budget.spec.ts from p34.
 */

import { describe, expect, it } from 'vitest';

import { evaluateContinuityPolicy } from '@mcp-vertex/proposals/lib/swarm/continuity-policy';
import type { IObservedContinuity } from '@mcp-vertex/proposals/lib/swarm/continuity-policy';
import type { IContinuityPolicy } from '@mcp-vertex/proposals/lib/swarm/swarm-types';

// ---------------------------------------------------------------------------
// withinPolicy: true when no violations
// ---------------------------------------------------------------------------
describe('evaluateContinuityPolicy — withinPolicy: true', () => {
	it('returns withinPolicy: true when all observed values are within policy', () => {
		const policy: IContinuityPolicy = {
			maxTasksPerSession: 5,
			maxAgentSpawnsPerSession: 3,
			maxToolRetriesPerTool: 2,
		};
		const observed: IObservedContinuity = {
			tasksCompletedInSession: 2,
			agentSpawnsInSession: 1,
			toolRetriesForTool: 1,
		};

		const result = evaluateContinuityPolicy(policy, observed);
		expect(result.withinPolicy).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it('returns withinPolicy: true when policy is empty (no enforcement)', () => {
		const result = evaluateContinuityPolicy({}, {});
		expect(result.withinPolicy).toBe(true);
		expect(result.violations).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// maxTasksPerSession exceeded → block violation
// ---------------------------------------------------------------------------
describe('evaluateContinuityPolicy — maxTasksPerSession', () => {
	it('returns block violation when tasks exceed maxTasksPerSession', () => {
		const policy: IContinuityPolicy = { maxTasksPerSession: 3 };
		const observed: IObservedContinuity = { tasksCompletedInSession: 5 };

		const result = evaluateContinuityPolicy(policy, observed);
		expect(result.withinPolicy).toBe(false);
		expect(result.violations).toHaveLength(1);
		expect(result.violations[0]).toMatchObject({
			field: 'maxTasksPerSession',
			severity: 'block',
		});
	});
});

// ---------------------------------------------------------------------------
// forbidNewProposals: true + proposals opened → block violation
// ---------------------------------------------------------------------------
describe('evaluateContinuityPolicy — forbidNewProposals', () => {
	it('returns block violation when new proposals opened and forbidden', () => {
		const policy: IContinuityPolicy = { forbidNewProposals: true };
		const observed: IObservedContinuity = {
			newProposalsOpenedInSession: 1,
		};

		const result = evaluateContinuityPolicy(policy, observed);
		expect(result.withinPolicy).toBe(false);
		const v = result.violations.find(
			(x) => x.field === 'forbidNewProposals',
		);
		expect(v).toBeDefined();
		expect(v?.severity).toBe('block');
	});

	it('returns withinPolicy: true when forbidNewProposals: false regardless of opened', () => {
		const policy: IContinuityPolicy = { forbidNewProposals: false };
		const observed: IObservedContinuity = {
			newProposalsOpenedInSession: 5,
		};

		const result = evaluateContinuityPolicy(policy, observed);
		expect(result.withinPolicy).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// maxToolRetriesPerTool exceeded → warn violation
// ---------------------------------------------------------------------------
describe('evaluateContinuityPolicy — maxToolRetriesPerTool', () => {
	it('returns warn violation when tool retries exceed maxToolRetriesPerTool', () => {
		const policy: IContinuityPolicy = { maxToolRetriesPerTool: 2 };
		const observed: IObservedContinuity = { toolRetriesForTool: 5 };

		const result = evaluateContinuityPolicy(policy, observed);
		expect(result.withinPolicy).toBe(false);
		const v = result.violations.find(
			(x) => x.field === 'maxToolRetriesPerTool',
		);
		expect(v).toBeDefined();
		expect(v?.severity).toBe('warn');
	});
});

// ---------------------------------------------------------------------------
// forbidReReadOnUnchangedDigest: true + willReReadUnchangedDoc: true → block (RE_READ_FORBIDDEN)
// ---------------------------------------------------------------------------
describe('evaluateContinuityPolicy — forbidReReadOnUnchangedDigest', () => {
	it('returns block violation RE_READ_FORBIDDEN when re-read forbidden and doc digest unchanged', () => {
		const policy: IContinuityPolicy = {
			forbidReReadOnUnchangedDigest: true,
		};
		const observed: IObservedContinuity = { willReReadUnchangedDoc: true };

		const result = evaluateContinuityPolicy(policy, observed);
		expect(result.withinPolicy).toBe(false);
		const v = result.violations.find(
			(x) => x.field === 'forbidReReadOnUnchangedDigest',
		);
		expect(v).toBeDefined();
		expect(v?.severity).toBe('block');
		expect(v?.message).toContain('RE_READ_FORBIDDEN');
	});

	it('returns withinPolicy: true when forbidReReadOnUnchangedDigest: true but doc not re-read', () => {
		const policy: IContinuityPolicy = {
			forbidReReadOnUnchangedDigest: true,
		};
		const observed: IObservedContinuity = { willReReadUnchangedDoc: false };

		const result = evaluateContinuityPolicy(policy, observed);
		expect(result.withinPolicy).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// requireCheckpointAfterTask: true + checkpointPresent !== true → block
// ---------------------------------------------------------------------------
describe('evaluateContinuityPolicy — requireCheckpointAfterTask', () => {
	it('returns block violation when a checkpoint is required but missing', () => {
		const policy: IContinuityPolicy = {
			requireCheckpointAfterTask: true,
		};
		const observed: IObservedContinuity = { checkpointPresent: false };

		const result = evaluateContinuityPolicy(policy, observed);
		expect(result.withinPolicy).toBe(false);
		const v = result.violations.find(
			(x) => x.field === 'requireCheckpointAfterTask',
		);
		expect(v).toBeDefined();
		expect(v?.severity).toBe('block');
		expect(v?.message).toContain('SESSION_COMPACTION_REQUIRED');
	});

	it('returns withinPolicy: true when the required checkpoint is present', () => {
		const policy: IContinuityPolicy = {
			requireCheckpointAfterTask: true,
		};
		const observed: IObservedContinuity = { checkpointPresent: true };

		const result = evaluateContinuityPolicy(policy, observed);
		expect(result.withinPolicy).toBe(true);
		expect(result.violations).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Accumulates multiple violations
// ---------------------------------------------------------------------------
describe('evaluateContinuityPolicy — multiple violations', () => {
	it('accumulates multiple violations across numeric and boolean checks', () => {
		const policy: IContinuityPolicy = {
			maxTasksPerSession: 2,
			forbidNewProposals: true,
			maxAgentSpawnsPerSession: 1,
		};
		const observed: IObservedContinuity = {
			tasksCompletedInSession: 5,
			newProposalsOpenedInSession: 2,
			agentSpawnsInSession: 3,
		};

		const result = evaluateContinuityPolicy(policy, observed);
		expect(result.withinPolicy).toBe(false);
		expect(result.violations.length).toBeGreaterThanOrEqual(3);
	});
});
