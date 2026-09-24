/**
 * hydrate-candidates-after-merge.script.spec.ts — when a merge is worth
 * refreshing the queue for, and when touching it would be wrong.
 */
import { describe, expect, it } from 'vitest';

import {
	HYDRATION_STEPS,
	skipReason,
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
		// `forge:refresh --apply` used to run first. It merged every
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
