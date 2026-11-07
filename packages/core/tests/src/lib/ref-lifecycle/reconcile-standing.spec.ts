/**
 * reconcile-standing.spec.ts — ref-lifecycle takes the unit verdict: a
 * work ref is no longer "developing, forever".
 */
import { describe, expect, it } from 'vitest';

import { reconcileRefs } from '@delendai/core/lib/ref-lifecycle/reconcile.service';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const { branches } = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const WORK = 'delendai/wip/a/implement/x1-S1-g1/work';

const roleFor = (standing?: 'live' | 'idle' | 'abandoned') =>
	reconcileRefs(
		[{ name: WORK, ...(standing === undefined ? {} : { standing }) }],
		[],
		branches,
	);

describe('a work ref under the unit verdict', () => {
	it('stays active when its owner is live, or when no verdict exists', () => {
		expect(roleFor('live').active).toHaveLength(1);
		expect(roleFor().active).toHaveLength(1);
	});

	it('is listed for adoption, never for removal, when idle', () => {
		const result = roleFor('idle');
		expect(result.adoptable.map((v) => v.name)).toEqual([WORK]);
		expect(result.reapable).toHaveLength(0);
		expect(result.needsAttention).toHaveLength(0);
	});

	it('needs attention, and is still never reaped, when abandoned', () => {
		const result = roleFor('abandoned');
		expect(result.needsAttention.map((v) => v.name)).toEqual([WORK]);
		expect(result.verdicts[0]?.reason).toContain('work retire');
		expect(result.reapable).toHaveLength(0);
	});
});
