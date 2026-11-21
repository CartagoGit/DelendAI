/**
 * work-publish-former-namespace.service.spec.ts — a unit entered under a
 * former namespace publishes under that namespace's publication prefix,
 * and one of the current namespace under the current one (f00808 S8).
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { publicationRefFromWorkRef } from '@delendai/core/lib/work-units/work-publish.service';

const switched = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
});

describe('publicationRefFromWorkRef across namespaces', () => {
	it('[<20ms] keeps a former-namespace unit under its own publication prefix', () => {
		expect(
			publicationRefFromWorkRef(
				switched,
				'refs/heads/delendai/wip/a/implement/f00808-S8-g1/t',
			),
		).toBe('refs/heads/delendai/pr/a/implement/f00808-S8-g1/t');
	});

	it('[<20ms] publishes a unit of the current namespace under the current prefix', () => {
		expect(
			publicationRefFromWorkRef(
				switched,
				'refs/heads/wip/implement/a/f00808-S8/t',
			),
		).toBe('refs/heads/pr/implement/a/f00808-S8/t');
	});

	it('[<20ms] has no name for a ref under no owned prefix', () => {
		expect(
			publicationRefFromWorkRef(switched, 'refs/heads/feature/x'),
		).toBeUndefined();
	});
});
