import { describe, expect, it } from 'vitest';

import { assertHotfixSource, assertReleaseApproval } from './index';

describe('release finalize policy', () => {
	it('requires approval for a release branch targeting main', () => {
		expect(() =>
			assertReleaseApproval({
				sourceBranch: 'release/patch/fix',
				targetBranch: 'main',
				approved: false,
			}),
		).toThrow('approval is required');
		expect(() =>
			assertReleaseApproval({
				sourceBranch: 'release/patch/fix',
				targetBranch: 'main',
				approved: true,
			}),
		).not.toThrow();
	});

	it('only permits main as hotfix source', () => {
		expect(() => assertHotfixSource('develop')).toThrow(
			'source must be main',
		);
		expect(() => assertHotfixSource('main')).not.toThrow();
	});
});
