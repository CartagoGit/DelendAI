import { describe, expect, it } from 'vitest';

import {
	citationsBySlice,
	citedCommitsForSlice,
	extractSliceCommits,
} from '../../../../src/lib/swarm/slice-cited-commits';

const proposal = [
	'---',
	'id: f00505',
	'recan:',
	'    - { at: 2026-09-01, notes: "history mentions `deadbee1234` here" }',
	'---',
	'',
	'# f00505 — a proposal',
	'',
	'## why',
	'',
	'The proposal itself was created in `aaaaaaa1111`, which says nothing',
	'about any slice having shipped.',
	'',
	'## Slices',
	'',
	'### S1 — first',
	'- **Status**: done',
	'- Shipped in `abc1234`.',
	'',
	'### S2 — second',
	'- **Status**: pending',
	'- Nothing shipped yet.',
	'',
	'### S3 — third',
	'- **Status**: done',
	'- Landed as `1234567890abcdef` and amended by `fedcba9`.',
	'',
	'## acceptance',
	'',
	'- The whole thing was verified at `9999999`.',
	'',
].join('\n');

describe('slice cited commits (f00505 S4)', () => {
	describe('extraction', () => {
		it('finds a backticked short hash', () => {
			expect(extractSliceCommits('shipped in `abc1234`')).toEqual([
				'abc1234',
			]);
		});

		it('finds a full-length hash', () => {
			expect(
				extractSliceCommits(
					'`1234567890abcdef1234567890abcdef12345678`',
				),
			).toEqual(['1234567890abcdef1234567890abcdef12345678']);
		});

		it('lowercases and dedupes', () => {
			expect(
				extractSliceCommits('`ABC1234` then again `abc1234`'),
			).toEqual(['abc1234']);
		});

		it('ignores a proposal id, which is hex-adjacent and never a commit', () => {
			expect(extractSliceCommits('see `f00505a` for context')).toEqual(
				[],
			);
		});

		it('ignores a CI run id, which is also valid hex', () => {
			expect(extractSliceCommits('run `123456789012`')).toEqual([]);
		});

		it('ignores a hash that is not backticked', () => {
			// The repo's own convention. Prose containing a bare hex word
			// is not a citation.
			expect(extractSliceCommits('shipped in abc1234')).toEqual([]);
		});

		it('ignores something too short to be a hash', () => {
			expect(extractSliceCommits('`abc12`')).toEqual([]);
		});
	});

	describe('citations belong to the slice that cites them', () => {
		it('attributes a hash only to its own slice', () => {
			// One shipped slice must not vouch for its unstarted
			// neighbours: a citation is half of what licenses withholding,
			// so that mistake withholds real work.
			expect(citedCommitsForSlice(proposal, 'S1')).toEqual(['abc1234']);
			expect(citedCommitsForSlice(proposal, 'S2')).toEqual([]);
		});

		it('collects several citations within one slice', () => {
			expect(citedCommitsForSlice(proposal, 'S3')).toEqual([
				'1234567890abcdef',
				'fedcba9',
			]);
		});

		it('does not attribute the proposal narrative to any slice', () => {
			// The commit that created the proposal is cited in `## why`.
			// Counting it would mark every slice as shipped on day one.
			const all = citationsBySlice(proposal).flatMap(
				(entry) => entry.citedCommits,
			);

			expect(all).not.toContain('aaaaaaa1111');
		});

		it('does not attribute frontmatter history to any slice', () => {
			const all = citationsBySlice(proposal).flatMap(
				(entry) => entry.citedCommits,
			);

			expect(all).not.toContain('deadbee1234');
		});

		it('stops at the next top-level section', () => {
			// `## acceptance` follows S3; its hash is about the proposal.
			expect(citedCommitsForSlice(proposal, 'S3')).not.toContain(
				'9999999',
			);
		});

		it('lists every slice it found, including those with no citation', () => {
			expect(
				citationsBySlice(proposal).map((entry) => entry.sliceId),
			).toEqual(['S1', 'S2', 'S3']);
		});
	});

	describe('degenerate input', () => {
		it('has nothing to say about a proposal with no slices', () => {
			expect(
				citationsBySlice('# just a document\n\nno slices here'),
			).toEqual([]);
		});

		it('returns empty for a slice that does not exist', () => {
			expect(citedCommitsForSlice(proposal, 'S99')).toEqual([]);
		});

		it('matches a slice id case-insensitively', () => {
			expect(citedCommitsForSlice(proposal, 's1')).toEqual(['abc1234']);
		});

		it('handles a lettered slice id', () => {
			const doc = ['### S1a — variant', 'shipped in `abc1234`'].join(
				'\n',
			);

			expect(citedCommitsForSlice(doc, 'S1a')).toEqual(['abc1234']);
		});
	});

	describe("against this repository's own shape", () => {
		it('reads a slice block written the way this repo writes them', () => {
			const real = [
				'## Slices',
				'',
				'### S7 — commit driver',
				'- **Status**: pending',
				'- **Files**: `plugins/commit-policy/src/lib/services/commit-driver.ts`',
				'- **Gate**: type',
				'- review-log: approved by peer — shipped in `06bc3d2f4`',
				'',
			].join('\n');

			// The declared file path is backticked too, and must not be
			// mistaken for a hash.
			expect(citedCommitsForSlice(real, 'S7')).toEqual(['06bc3d2f4']);
		});
	});
});
