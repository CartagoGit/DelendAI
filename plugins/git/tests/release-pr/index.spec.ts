import { describe, expect, it } from 'vitest';

import { validateReleasePromotionGit } from '../../src/lib/release-pr';
import type { ReleasePromotionGitError } from '../../src/lib/release-pr';

describe('release PR git contract', () => {
	it('accepts a release branch with main as base and upstream', () => {
		expect(
			validateReleasePromotionGit({
				currentBranch: 'release/minor/august-cut',
				baseBranch: 'main',
				upstream: 'origin/release/minor/august-cut',
			}),
		).toEqual({
			branch: 'release/minor/august-cut',
			base: 'main',
			upstream: 'origin/release/minor/august-cut',
		});
	});

	it('rejects wrong branch, wrong base, and missing upstream', () => {
		expect(() =>
			validateReleasePromotionGit({
				currentBranch: 'develop',
				baseBranch: 'main',
				upstream: 'origin/develop',
			}),
		).toThrowError(
			expect.objectContaining<Partial<ReleasePromotionGitError>>({
				code: 'wrong-branch',
			}),
		);
		expect(() =>
			validateReleasePromotionGit({
				currentBranch: 'release/patch/august-cut',
				baseBranch: 'develop',
				upstream: 'origin/release/patch/august-cut',
			}),
		).toThrowError(expect.objectContaining({ code: 'wrong-base' }));
		expect(() =>
			validateReleasePromotionGit({
				currentBranch: 'release/patch/august-cut',
				baseBranch: 'main',
			}),
		).toThrowError(expect.objectContaining({ code: 'missing-upstream' }));
	});
});
