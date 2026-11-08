/**
 * hydrate-candidates-after-merge.script.spec.ts — when a merge is worth
 * refreshing the queue for, and when touching it would be wrong.
 */
import { describe, expect, it } from 'vitest';

import {
	HYDRATION_LOG_MAX_BYTES,
	HYDRATION_STEPS,
	QUICK_STEPS,
	logIsFull,
	skipReason,
	stepTimeout,
} from './hydrate-candidates-after-merge.script';

describe('skipReason (x00554 S2)', () => {
	it('runs when the shared checkout just moved the integration branch', () => {
		expect(
			skipReason({
				mainWorktree: true,
				branch: 'develop',
				integration: 'develop',
			}),
		).toBeUndefined();
	});

	it('reads the integration branch from the policy, never assumes develop', () => {
		expect(
			skipReason({
				mainWorktree: true,
				branch: 'trunk',
				integration: 'trunk',
			}),
		).toBeUndefined();
		expect(
			skipReason({
				mainWorktree: true,
				branch: 'develop',
				integration: 'trunk',
			}),
		).toContain('not on trunk');
	});

	it('abstains in an agent worktree, where refreshing is not its business', () => {
		expect(
			skipReason({
				mainWorktree: false,
				branch: 'develop',
				integration: 'develop',
			}),
		).toContain('agent worktree');
	});

	it('abstains on a detached HEAD and on any other branch', () => {
		expect(
			skipReason({
				mainWorktree: true,
				branch: undefined,
				integration: 'develop',
			}),
		).toContain('(detached)');
		expect(
			skipReason({
				mainWorktree: true,
				branch: 'delendai/wip/agent/x-S1-g1',
				integration: 'develop',
			}),
		).toContain('delendai/wip/agent/x-S1-g1');
	});
});

describe('what bringing the candidates forward runs', () => {
	it('certifies what landed first, then has one writer that merges and regenerates', () => {
		// A second refresher used to run first. It merged every
		// candidate textually, so the regenerating step found nothing
		// behind and never ran.
		const scripts = HYDRATION_STEPS.map(([script]) => script);
		expect(scripts[0]).toBe(
			'tools/scripts/forge/certify-integration.script.ts',
		);
		expect(scripts[1]).toBe(
			'tools/scripts/git/refresh-candidate-artifacts.script.ts',
		);
		expect(scripts.join(' ')).not.toContain('refresh-candidates');
	});
});

describe('the quick steps', () => {
	it('are the short ones, so a long refresh never starves them', () => {
		expect(QUICK_STEPS).toEqual([
			'tools/scripts/forge/certify-integration.script.ts',
			'tools/scripts/forge/advance-queue.script.ts',
		]);
		for (const [script, timeout] of HYDRATION_STEPS) {
			if (QUICK_STEPS.includes(script)) {
				expect(timeout).toBeLessThanOrEqual(60_000);
			} else {
				expect(timeout).toBeGreaterThanOrEqual(180_000);
			}
		}
	});
});

describe('the hydration log', () => {
	it('is set aside once it outgrows its limit', () => {
		expect(logIsFull(HYDRATION_LOG_MAX_BYTES + 1)).toBe(true);
	});

	it('keeps being written while within it, or when it does not exist yet', () => {
		expect(logIsFull(HYDRATION_LOG_MAX_BYTES)).toBe(false);
		expect(logIsFull(undefined)).toBe(false);
	});
});

describe('a step within the pass budget', () => {
	it('keeps its own timeout while the budget lasts', () => {
		expect(stepTimeout(60_000, 1_000_000, 0)).toBe(60_000);
	});

	it('is cut to what is left of the budget', () => {
		expect(stepTimeout(3_600_000, 1_000, 400)).toBe(600);
	});

	it('is skipped once the budget is spent', () => {
		expect(stepTimeout(60_000, 1_000, 1_000)).toBeUndefined();
	});
});
