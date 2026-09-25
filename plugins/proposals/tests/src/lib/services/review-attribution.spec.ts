/**
 * review-attribution.spec.ts — the pure half of attributing a delivery:
 * reading a name out of a merge subject or a trailer, and writing the
 * verified commit where `review → done` looks for it.
 */
import { describe, expect, it } from 'vitest';

import {
	agentFromMergeSubject,
	agentFromTrailer,
	checkAttributedApprover,
	everySliceReviewed,
	needsAttributedRound,
	withShippedIn,
} from '@delendai/proposals/lib/services/review-attribution';
import { EMPTY_REVIEW } from '@delendai/proposals/lib/swarm/proposal-review';

const PROPOSAL = (frontmatter: string, slices: string): string => `---
id: x00001
status: review
${frontmatter}---

## Slices

${slices}`;

describe('agentFromMergeSubject', () => {
	it('reads the agent segment of a publication ref', () => {
		expect(
			agentFromMergeSubject(
				'Merge pull request #303 from CartagoGit/delendai/pr/claude-opus-5/x00568-S1-g1/a-publication',
				'delendai/pr/',
			),
		).toBe('claude-opus-5');
	});

	it('names nobody for a ref without an agent segment', () => {
		expect(
			agentFromMergeSubject(
				'Merge pull request #301 from Owner/delendai/pr/x00566-guards-run',
				'delendai/pr/',
			),
		).toBeUndefined();
	});

	it('names nobody for a merge that is not a pull request, or another prefix', () => {
		expect(
			agentFromMergeSubject(
				"Merge branch 'develop' into x",
				'delendai/pr/',
			),
		).toBeUndefined();
		expect(
			agentFromMergeSubject(
				'Merge pull request #1 from Owner/team/pr/agent/unit/topic',
				'delendai/pr',
			),
		).toBeUndefined();
	});
});

describe('agentFromTrailer', () => {
	it('slugs the model named in a Co-Authored-By trailer', () => {
		expect(
			agentFromTrailer('Claude Opus 5.5 <noreply@anthropic.com>'),
		).toBe('claude-opus-5-5');
	});

	it('names nobody for an empty trailer', () => {
		expect(agentFromTrailer(' <x@y.z> ')).toBeUndefined();
	});
});

describe('needsAttributedRound', () => {
	it('is needed only for a slice with no round in a proposal in review', () => {
		expect(needsAttributedRound(EMPTY_REVIEW, PROPOSAL('', ''))).toBe(true);
		expect(
			needsAttributedRound(
				EMPTY_REVIEW,
				PROPOSAL('', '').replace(
					'status: review',
					'status: in-progress',
				),
			),
		).toBe(false);
		expect(
			needsAttributedRound(
				{ ...EMPTY_REVIEW, status: 'in_review', implementer: 'a' },
				PROPOSAL('', ''),
			),
		).toBe(false);
	});
});

describe('checkAttributedApprover', () => {
	const attribution = { commit: 'c', implementer: 'Agent-A', source: 's' };

	it('refuses the attributed implementer, whatever its case', () => {
		expect(checkAttributedApprover(attribution, 'agent-a').ok).toBe(false);
	});

	it('accepts anyone else', () => {
		expect(checkAttributedApprover(attribution, 'agent-b')).toEqual({
			ok: true,
		});
	});
});

describe('withShippedIn', () => {
	it('adds the field when the proposal has none', () => {
		expect(withShippedIn(PROPOSAL('', ''), 'abc1234')).toContain(
			'shipped-in:\n  - abc1234\n',
		);
	});

	it('appends to an inline list and keeps what was there', () => {
		const updated = withShippedIn(
			PROPOSAL('shipped-in: ["1111111"]\n', ''),
			'abc1234',
		);
		expect(updated).toContain('shipped-in:\n  - 1111111\n  - abc1234\n');
	});

	it('does not repeat a commit already listed, short or long', () => {
		const markdown = PROPOSAL('shipped-in: [abc1234]\n', '');
		expect(withShippedIn(markdown, 'abc1234def')).toBe(markdown);
	});
});

describe('everySliceReviewed', () => {
	const reviewed = `### S1 — one
- **Status**: done
- review-state: done
`;

	it('holds when every slice is done and approved', () => {
		expect(everySliceReviewed('x00001', PROPOSAL('', reviewed))).toBe(true);
	});

	it('does not hold while another slice is only hand-marked done', () => {
		expect(
			everySliceReviewed(
				'x00001',
				PROPOSAL('', `${reviewed}\n### S2 — two\n- **Status**: done\n`),
			),
		).toBe(false);
	});
});
