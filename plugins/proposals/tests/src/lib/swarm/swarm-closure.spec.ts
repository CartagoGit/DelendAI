/**
 * swarm-closure.spec.ts
 *
 * TDD specs for `runSwarmClosure` (p34b T3 point 11).
 *
 * Shape: `{ withinSwarmBudget, withinContinuityPolicy, swarmViolations,
 *          closureDecision }` where `closureDecision` is
 * `'close' | 'open_fix' | 'open_heredera'`.
 *
 * Composition: validateBudget (p34) + evaluateContinuityPolicy (T1) +
 * a tiny in-memory representation of the subagent tree and the lock
 * status. The spec does NOT hit the filesystem — closures work over the
 * values the orchestrator collects at the end of a round.
 */

import { describe, expect, it } from 'vitest';

import { runSwarmClosure } from '@mcp-vertex/proposals/lib/swarm/swarm-closure';
import type {
	ICloseSwarmInput,
	IAgentTreeSummary,
} from '@mcp-vertex/proposals/lib/swarm/swarm-closure';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const STALE_LOCK_TIMESTAMP = '2026-06-05T00:00:00.000Z';
const FRESH_LOCK_TIMESTAMP = '2026-06-05T08:00:00.000Z';

const _emptyTree = (): IAgentTreeSummary => ({
	totalAssignments: 0,
	activeCount: 0,
	cooldownCount: 0,
	orphanCount: 0,
	adoptedCount: 0,
});

const healthyTree = (): IAgentTreeSummary => ({
	totalAssignments: 1,
	activeCount: 0,
	cooldownCount: 1,
	orphanCount: 0,
	adoptedCount: 0,
});

const inputWith = (
	overrides: Partial<ICloseSwarmInput> = {}
): ICloseSwarmInput => ({
	proposalId: 'p34b',
	budget: {
		maxIterations: 6,
		maxPremiumCalls: 1,
		maxToolCalls: 80,
	},
	swarmBudget: {
		maxSessionsActive: 1,
		maxAgentsPerSession: 2,
		maxToolRetriesPerSession: 3,
		maxCoreDocRereadsPerSession: 1,
	},
	continuityPolicy: {
		forbidNewProposals: true,
		requireCheckpointAfterTask: true,
		forbidReReadOnUnchangedDigest: true,
	},
	observedUsage: {
		iterations: 4,
		premiumCalls: 0,
		toolCalls: 30,
	},
	observedContinuity: {
		tasksCompletedInSession: 3,
		newProposalsOpenedInSession: 0,
		agentSpawnsInSession: 1,
		willReReadUnchangedDoc: false,
	},
	agentTree: healthyTree(),
	locks: [],
	checkpointPresent: true,
	nowIso: FRESH_LOCK_TIMESTAMP,
	...overrides,
});

// ---------------------------------------------------------------------------
// Case 1: happy path → close
// ---------------------------------------------------------------------------

describe('runSwarmClosure — case 1: clean close', () => {
	it('returns closureDecision: "close" when within budget, within policy, no locks, no orphans', () => {
		const result = runSwarmClosure(inputWith());

		expect(result.withinSwarmBudget).toBe(true);
		expect(result.withinContinuityPolicy).toBe(true);
		expect(result.swarmViolations).toHaveLength(0);
		expect(result.closureDecision).toBe('close');
	});
});

// ---------------------------------------------------------------------------
// Case 2: swarmViolation (block) → open_fix
// ---------------------------------------------------------------------------

describe('runSwarmClosure — case 2: block violation', () => {
	it('returns closureDecision: "open_fix" when a block severity budget violation is present', () => {
		// maxPremiumCalls: 1 + observed premiumCalls: 5 → block.
		const result = runSwarmClosure(
			inputWith({
				observedUsage: {
					iterations: 4,
					premiumCalls: 5,
					toolCalls: 30,
				},
			})
		);

		expect(result.withinSwarmBudget).toBe(false);
		expect(result.swarmViolations.some((v) => v.severity === 'block')).toBe(
			true
		);
		expect(result.closureDecision).toBe('open_fix');
	});

	it('returns closureDecision: "open_fix" when a continuity policy block violation is present', () => {
		const result = runSwarmClosure(
			inputWith({
				observedContinuity: {
					tasksCompletedInSession: 10, // exceeds maxTasksPerSession: undefined
					newProposalsOpenedInSession: 1, // triggers forbidNewProposals
					willReReadUnchangedDoc: true, // triggers forbidReReadOnUnchangedDigest
				},
			})
		);

		expect(result.withinContinuityPolicy).toBe(false);
		expect(result.swarmViolations.length).toBeGreaterThan(0);
		expect(result.closureDecision).toBe('open_fix');
	});
});

// ---------------------------------------------------------------------------
// Case 3: agentTree.orphanCount > 0 → open_fix
// ---------------------------------------------------------------------------

describe('runSwarmClosure — case 3: orphan subagents', () => {
	it('returns closureDecision: "open_fix" when the subagent registry has orphans', () => {
		const result = runSwarmClosure(
			inputWith({
				agentTree: {
					totalAssignments: 2,
					activeCount: 0,
					cooldownCount: 1,
					orphanCount: 1,
					adoptedCount: 0,
				},
			})
		);

		expect(result.closureDecision).toBe('open_fix');
	});
});

// ---------------------------------------------------------------------------
// Case 4: stale locks → open_fix
// ---------------------------------------------------------------------------

describe('runSwarmClosure — case 4: stale locks', () => {
	it('returns closureDecision: "open_fix" when a live lock is older than stale_after_minutes', () => {
		// `stale_after_minutes` defaults to 10; we set last_seen 30 min ago.
		const result = runSwarmClosure(
			inputWith({
				locks: [
					{
						taskId: 'p34b-t3',
						agent: 'forza_motorsport_2023',
						files: ['libs/mcp-project/src/server.ts'],
						lastSeenIso: STALE_LOCK_TIMESTAMP,
						nowIso: FRESH_LOCK_TIMESTAMP,
					},
				],
			})
		);

		expect(result.closureDecision).toBe('open_fix');
	});

	it('accepts fresh locks without rejecting closure', () => {
		const result = runSwarmClosure(
			inputWith({
				locks: [
					{
						taskId: 'p34b-t3',
						agent: 'forza_motorsport_2023',
						files: ['libs/mcp-project/src/server.ts'],
						lastSeenIso: FRESH_LOCK_TIMESTAMP,
						nowIso: FRESH_LOCK_TIMESTAMP,
					},
				],
			})
		);

		expect(result.closureDecision).toBe('close');
	});
});

// ---------------------------------------------------------------------------
// Case 5: missing checkpoint when requireCheckpointAfterTask → open_fix
// ---------------------------------------------------------------------------

describe('runSwarmClosure — case 5: missing checkpoint', () => {
	it('returns closureDecision: "open_fix" when the policy demands a checkpoint and none was emitted', () => {
		const result = runSwarmClosure(
			inputWith({
				checkpointPresent: false,
			})
		);

		expect(result.withinContinuityPolicy).toBe(false);
		expect(result.closureDecision).toBe('open_fix');
	});
});

// ---------------------------------------------------------------------------
// Case 6: empty proposal budget is permissive
// ---------------------------------------------------------------------------

describe('runSwarmClosure — case 6: no declared budget', () => {
	it('treats an empty budget/policy as no-enforcement', () => {
		const result = runSwarmClosure(
			inputWith({
				budget: {},
				swarmBudget: {},
				continuityPolicy: {},
				observedUsage: {
					iterations: 100,
					premiumCalls: 50,
					toolCalls: 5000,
				},
				observedContinuity: {
					tasksCompletedInSession: 50,
					newProposalsOpenedInSession: 5,
				},
				checkpointPresent: false,
			})
		);

		expect(result.withinSwarmBudget).toBe(true);
		expect(result.withinContinuityPolicy).toBe(true);
		expect(result.closureDecision).toBe('close');
	});
});
