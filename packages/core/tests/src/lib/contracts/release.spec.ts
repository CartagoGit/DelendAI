import { describe, expect, it } from 'vitest';

import {
	assertReleaseSlug,
	releaseBranch,
	slugifyRelease,
} from '@mcp-vertex/core/public';

describe('release contracts', () => {
	it('normalizes and validates lower-kebab slugs', () => {
		expect(slugifyRelease('R1: Immutable Candidate')).toBe(
			'r1-immutable-candidate',
		);
		expect(() => assertReleaseSlug('Not_Kebab')).toThrow();
	});

	it('builds the typed release branch', () => {
		expect(releaseBranch('minor', 'r1-contracts')).toBe(
			'release/minor/r1-contracts',
		);
	});
});
