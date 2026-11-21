/**
 * former-namespace-classification.spec.ts — a ref under a former owned
 * namespace is classified exactly like one under the current namespace
 * (f00808 S8). This repository writes `wip/` and `pr/` and still has
 * live `delendai/wip/`, `delendai/pr/` and `delendai/queue/` refs; the
 * lifecycle guard called each of them "outside every namespace".
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { reconcileRefs } from '@delendai/core/lib/ref-lifecycle/reconcile.service';

const branches = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		integration: { requiredChecks: ['delendai-validate'] },
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
}).branches;

const roleOf = (name: string, state?: 'open' | 'merged') =>
	reconcileRefs(
		[{ name }],
		state === undefined
			? []
			: [
					{
						number: 1,
						state,
						headRefName: name,
					},
				],
		branches,
	).verdicts[0]?.role;

describe('a former namespace is classified like the current one', () => {
	it('[<5ms] reads a work ref under either namespace as work', () => {
		for (const name of [
			'wip/implement/a/x00001-S1/t',
			'delendai/wip/a/implement/x00001-S1-g1/t',
		]) {
			expect(roleOf(name)).toBe('work');
		}
	});

	it('[<5ms] reads a publication under either namespace by its pull request', () => {
		for (const name of ['pr/a/t', 'delendai/pr/a/t']) {
			expect(roleOf(name, 'open')).toBe('publication-open');
			expect(roleOf(name, 'merged')).toBe('publication-spent');
			expect(roleOf(name)).toBe('publication-unclaimed');
		}
	});

	it('[<5ms] reads a land batch under either namespace', () => {
		for (const name of ['queue/batch-1', 'delendai/queue/batch-1']) {
			expect(roleOf(name)).toBe('batch-spent');
		}
	});

	it('[<5ms] still calls a ref outside every owned namespace unmanaged', () => {
		expect(roleOf('feat/other')).toBe('unmanaged');
	});
});
