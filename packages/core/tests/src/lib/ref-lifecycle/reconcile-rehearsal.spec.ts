/**
 * reconcile-rehearsal.spec.ts — a rehearsal's branches live under the
 * owned rehearsal namespace: the guard and the forge ruleset admit them,
 * and the ref reconciler reports them without reaping, since their run
 * deletes them at cleanup.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	allowedRefPatterns,
	insideNamespaces,
	ownedRehearsalPrefixes,
} from '@delendai/core/lib/integration/decisions/namespaces.helper';
import { reconcileRefs } from '@delendai/core/lib/ref-lifecycle/reconcile.service';

const policy = resolveDevelopmentPolicy({
	development: {
		branches: { namespacePrefix: 'ns', formerNamespacePrefixes: ['old'] },
	},
});

describe('the rehearsal namespace', () => {
	it('[<5ms] is owned under the current namespace first, then each former one', () => {
		expect(ownedRehearsalPrefixes(policy.branches)).toEqual([
			'ns/rehearsal/',
			'old/rehearsal/',
		]);
	});

	it('[<5ms] is admitted by the guard and by the forge ruleset', () => {
		expect(insideNamespaces(policy, 'ns/rehearsal/r1/integration')).toBe(
			true,
		);
		expect(allowedRefPatterns(policy)).toContain(
			'refs/heads/ns/rehearsal/**/*',
		);
	});

	it('[<5ms] is reported and never reaped, with or without a pull request', () => {
		for (const state of [undefined, 'open', 'closed'] as const) {
			const name = 'ns/rehearsal/r1/pr-1';
			const result = reconcileRefs(
				[{ name, contained: true }],
				state === undefined
					? []
					: [{ number: 1, headRefName: name, state }],
				policy.branches,
			);
			expect(result.verdicts[0]?.role).toBe('rehearsal');
			expect(result.reapable).toEqual([]);
		}
	});
});
