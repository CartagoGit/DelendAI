/**
 * continuity-enforcer.spec.ts
 *
 * Pure unit tests for `enforceContinuity`. Verifies:
 *  1. Empty policy → no downgrade, no annotation.
 *  2. Within-policy observed → no downgrade.
 *  3. block violation (maxAgentSpawnsPerSession exceeded) → mode='reset',
 *     reason includes `continuity-reset:`.
 *  4. warn-only violation → reason includes `continuity-warn:`, mode preserved.
 *  5. forbidReReadOnUnchangedDigest + willReReadUnchangedDoc → block.
 *  6. annotateOnly + closedTasksDigest → reason includes
 *     `cross-session-resume:` and no downgrade.
 *  7. ORCHESTRATOR_DEFAULT_POLICY exposes the values declared in
 *     `.github/agents/orchestrator.agent.md`.
 */

import { describe, expect, it } from 'vitest';

import {
	enforceContinuity,
	ORCHESTRATOR_DEFAULT_POLICY,
} from '@cartago-git/mcp-proposals/lib/swarm/continuity-enforcer';
import type { IEnforceDecisionLike } from '@cartago-git/mcp-proposals/lib/swarm/continuity-enforcer';
import type { IContinuityPolicy } from '@cartago-git/mcp-proposals/lib/swarm/swarm-types';

const baseDecision: IEnforceDecisionLike = {
	layer: 'chat-context',
	proposalId: 'p34b',
	mode: 'resume',
	taskHint: 'T2',
	reason: 'Live lock on p34b-T2.',
};

describe('enforceContinuity — no-op branches', () => {
	it('returns the decision unchanged when policy is empty', () => {
		const result = enforceContinuity({
			policy: {},
			observed: {},
			decision: baseDecision,
		});
		expect(result.decision).toBe(baseDecision);
		expect(result.annotated).toBe(false);
		expect(result.check.withinPolicy).toBe(true);
		expect(result.check.violations).toHaveLength(0);
	});

	it('returns the decision unchanged when observed is within policy', () => {
		const policy: IContinuityPolicy = {
			maxAgentSpawnsPerSession: 2,
		};
		const result = enforceContinuity({
			policy,
			observed: { agentSpawnsInSession: 1 },
			decision: baseDecision,
		});
		expect(result.decision.mode).toBe('resume');
		expect(result.annotated).toBe(false);
	});
});

describe('enforceContinuity — block violations', () => {
	it('downgrades to mode=reset when maxAgentSpawnsPerSession exceeded', () => {
		const policy: IContinuityPolicy = {
			maxAgentSpawnsPerSession: 2,
		};
		const result = enforceContinuity({
			policy,
			observed: { agentSpawnsInSession: 3 },
			decision: baseDecision,
		});
		expect(result.decision.mode).toBe('reset');
		expect(result.decision.reason).toContain('continuity-reset:');
		expect(result.decision.reason).toContain('maxAgentSpawnsPerSession');
		expect(result.annotated).toBe(true);
		expect(result.check.withinPolicy).toBe(false);
	});

	it('blocks when forbidReReadOnUnchangedDigest is violated', () => {
		const policy: IContinuityPolicy = {
			forbidReReadOnUnchangedDigest: true,
		};
		const result = enforceContinuity({
			policy,
			observed: { willReReadUnchangedDoc: true },
			decision: baseDecision,
		});
		expect(result.decision.mode).toBe('reset');
		expect(result.decision.reason).toContain(
			'forbidReReadOnUnchangedDigest'
		);
	});
});

describe('enforceContinuity — warn-only violations', () => {
	it('annotates the reason without downgrading on warn severity', () => {
		// `maxToolRetriesPerTool` is severity 'warn' in the FIELD_DEFS table,
		// so a single overshoot should NOT downgrade the mode.
		const policy: IContinuityPolicy = {
			maxToolRetriesPerTool: 1,
		};
		const result = enforceContinuity({
			policy,
			observed: { toolRetriesForTool: 3 },
			decision: baseDecision,
		});
		expect(result.decision.mode).toBe('resume');
		expect(result.decision.reason).toContain('continuity-warn:');
		expect(result.annotated).toBe(true);
		expect(result.check.withinPolicy).toBe(false);
	});
});

describe('enforceContinuity — cross-session resume annotation', () => {
	it('appends a cross-session-resume hint when annotateOnly is true and the closed log has entries', () => {
		const result = enforceContinuity({
			policy: {},
			observed: {},
			decision: baseDecision,
			annotateOnly: true,
			closedTasksDigest: [
				{
					taskId: 'p34b-T1',
					closedAt: '2026-06-08T10:00:00.000Z',
					agentName: 'implementation_runner',
				},
			],
		});
		expect(result.decision.mode).toBe('resume');
		expect(result.decision.reason).toContain('cross-session-resume:');
		expect(result.decision.reason).toContain('p34b-T1');
		expect(result.decision.reason).toContain('implementation_runner');
		expect(result.annotated).toBe(true);
	});

	it('does not annotate when annotateOnly is omitted even if the closed log is non-empty', () => {
		const result = enforceContinuity({
			policy: {},
			observed: {},
			decision: baseDecision,
			closedTasksDigest: [
				{
					taskId: 'p34b-T1',
					closedAt: '2026-06-08T10:00:00.000Z',
					agentName: 'implementation_runner',
				},
			],
		});
		expect(result.decision.reason).not.toContain('cross-session-resume:');
		expect(result.annotated).toBe(false);
	});
});

describe('ORCHESTRATOR_DEFAULT_POLICY', () => {
	it('mirrors the hard policy declared in orchestrator.agent.md', () => {
		expect(ORCHESTRATOR_DEFAULT_POLICY.maxAgentSpawnsPerSession).toBe(2);
		expect(ORCHESTRATOR_DEFAULT_POLICY.maxToolRetriesPerTool).toBe(3);
		expect(ORCHESTRATOR_DEFAULT_POLICY.forbidReReadOnUnchangedDigest).toBe(
			true
		);
		expect(ORCHESTRATOR_DEFAULT_POLICY.requireCheckpointAfterTask).toBe(
			true
		);
	});
});
