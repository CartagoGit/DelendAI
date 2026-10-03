import { describe, expect, it } from 'vitest';

import {
	assertReleaseMetadata,
	assertReleaseSlug,
	nextVersion,
	releaseBranch,
	slugifyRelease,
} from '@delendai/core/public';
import type { IReleaseCandidateMetadata } from '@delendai/core/public';

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

describe('every way release metadata can be wrong', () => {
	const coherent: IReleaseCandidateMetadata = {
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

	// Each of these is a way a release could be cut from something other
	// than what it claims, which is the one thing this contract exists to
	// stop. They were unreachable from any test.
	const cases: readonly {
		readonly name: string;
		readonly patch: Partial<IReleaseCandidateMetadata>;
		readonly message: RegExp;
	}[] = [
		{
			name: 'a source SHA that is not one',
			patch: { sourceDevelopSha: 'not-a-sha' },
			message: /source and base SHAs/,
		},
		{
			name: 'a base SHA that is not one',
			patch: { baseMainSha: 'zzz' },
			message: /source and base SHAs/,
		},
		{
			name: 'a fromVersion that is not X.Y.Z',
			patch: { fromVersion: '1.4' },
			message: /plain fromVersion/,
		},
		{
			name: 'an actor nobody can name',
			patch: { actor: '   ' },
			message: /requires an actor/,
		},
		{
			name: 'a timestamp that is not a date',
			patch: { timestamp: 'yesterday' },
			message: /valid timestamp/,
		},
		{
			name: 'a state outside the vocabulary',
			patch: {
				state: 'shipped' as IReleaseCandidateMetadata['state'],
			},
			message: /valid state/,
		},
		{
			name: 'a proposal id that is empty',
			patch: { includedProposals: ['f00393', '  '] },
			message: /non-empty strings/,
		},
		{
			name: 'a slug that is not lower-kebab',
			patch: {
				slug: 'Not_Kebab',
				branch: 'release/patch/Not_Kebab',
			},
			message: /branch does not match|lower-kebab/,
		},
	];

	for (const testCase of cases) {
		it(`refuses ${testCase.name}`, () => {
			expect(() =>
				assertReleaseMetadata({ ...coherent, ...testCase.patch }),
			).toThrow(testCase.message);
		});
	}

	it('accepts the coherent one it is compared against', () => {
		expect(assertReleaseMetadata(coherent)).toEqual(coherent);
	});
});

describe('slugifying a release title', () => {
	it('drops the separators a punctuation-only title leaves behind', () => {
		expect(slugifyRelease('  --R1: contracts--  ')).toBe('r1-contracts');
	});

	it('refuses a title that slugifies to nothing', () => {
		expect(() => slugifyRelease('---')).toThrow(/lower-kebab-case/);
	});

	it('stays linear on a long run of punctuation', () => {
		// The pattern this replaced restarted at every position of the
		// dash run the replacement above produces.
		const startedAt = performance.now();
		expect(() => slugifyRelease('-'.repeat(40_000))).toThrow();
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});
});
