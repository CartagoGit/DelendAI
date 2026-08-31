import { describe, expect, it } from 'vitest';

import {
	assertReleaseMetadata,
	assertReleaseSlug,
	nextVersion,
	releaseBranch,
	slugifyRelease,
} from '@mcp-vertex/core/public';
import type { IReleaseCandidateMetadata } from '@mcp-vertex/core/public';

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

	it('rejects inconsistent release metadata', () => {
		const metadata: IReleaseCandidateMetadata = {
			sourceDevelopSha: '1111111',
			baseMainSha: '2222222',
			fromVersion: '1.4.2',
			targetVersion: nextVersion('1.4.2', 'patch'),
			type: 'patch',
			slug: 'r1-contracts',
			branch: 'release/minor/r1-contracts',
			actor: 'release-agent',
			timestamp: '2026-08-31T00:00:00.000Z',
			includedProposals: ['f00393'],
			state: 'cut',
		};
		expect(() => assertReleaseMetadata(metadata)).toThrow();
		expect(() =>
			assertReleaseMetadata({
				...metadata,
				branch: releaseBranch('patch', 'r1-contracts'),
				targetVersion: '9.9.9',
			}),
		).toThrow();
	});

	it('accepts coherent release metadata', () => {
		const metadata: IReleaseCandidateMetadata = {
			sourceDevelopSha: '1111111',
			baseMainSha: '2222222',
			fromVersion: '1.4.2',
			targetVersion: '1.4.3',
			type: 'patch',
			slug: 'r1-contracts',
			branch: releaseBranch('patch', 'r1-contracts'),
			actor: 'release-agent',
			timestamp: '2026-08-31T00:00:00.000Z',
			includedProposals: ['f00393'],
			state: 'cut',
		};
		expect(assertReleaseMetadata(metadata)).toBe(metadata);
	});
});
