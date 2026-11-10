/**
 * reconcile-retired-machinery.spec.ts — what the old queue left (trains and
 * their culprit markers) is reaped once it holds nothing of its own, and
 * land's batches end with their pull requests.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { reconcileRefs } from '@delendai/core/lib/ref-lifecycle/reconcile.service';

const { branches } = resolveDevelopmentPolicy({
	development: { branches: { namespacePrefix: 'ns' } },
});

const verdictOf = (
	ref: { readonly name: string; readonly contained?: boolean },
	state?: 'open' | 'merged' | 'closed',
) =>
	reconcileRefs(
		[ref],
		state === undefined
			? []
			: [{ number: 1, headRefName: ref.name, state }],
		branches,
	);

describe('retired machinery and batches', () => {
	it('[<5ms] reaps a culprit marker that holds nothing of its own', () => {
		const result = verdictOf({
			name: 'ns/train/culprit/1830',
			contained: true,
		});
		expect(result.verdicts[0]?.role).toBe('retired-machinery');
		expect(result.reapable.map((v) => v.name)).toEqual([
			'ns/train/culprit/1830',
		]);
	});

	it('[<5ms] keeps and reports a train that may hold the only copy', () => {
		for (const contained of [false, undefined]) {
			const result = verdictOf({
				name: 'ns/train/0123456789ab/1-2',
				...(contained === undefined ? {} : { contained }),
			});
			expect(result.verdicts[0]?.role).toBe('retired-machinery-holding');
			expect(result.reapable).toEqual([]);
			expect(result.needsAttention).toHaveLength(1);
		}
	});

	it('[<5ms] keeps an open land batch and reaps a settled one', () => {
		const name = 'ns/queue/batch-1+2';
		expect(verdictOf({ name }, 'open').verdicts[0]?.role).toBe(
			'batch-open',
		);
		for (const state of ['merged', 'closed', undefined] as const) {
			const result = verdictOf({ name }, state);
			expect(result.verdicts[0]?.role).toBe('batch-spent');
			expect(result.reapable.map((v) => v.name)).toEqual([name]);
			expect(result.needsAttention).toEqual([]);
		}
	});
});
