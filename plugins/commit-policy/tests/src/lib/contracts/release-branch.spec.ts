import { describe, expect, it } from 'vitest';

import {
	buildReleaseBranch,
	isReleaseBranch,
} from '@delendai/commit-policy/public';

describe('release branch boundary', () => {
	it('accepts only typed release branches with lower-kebab slugs', () => {
		expect(isReleaseBranch('release/patch/r1-contracts')).toBe(true);
		expect(isReleaseBranch('release/minor/r1-contracts')).toBe(true);
		expect(isReleaseBranch('release/major/R1-contracts')).toBe(false);
		expect(isReleaseBranch('feature/r1-contracts')).toBe(false);
	});

	it('builds the canonical release branch', () => {
		expect(buildReleaseBranch('major', 'r1-contracts')).toBe(
			'release/major/r1-contracts',
		);
	});
});
