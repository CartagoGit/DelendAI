/**
 * review-attribution.spec.ts — the pure half of attributing a delivery:
 * reading a name out of a trailer, and writing the
 * verified commit where `review → done` looks for it.
 */
import { describe, expect, it } from 'vitest';

import {
	agentFromTrailer,
	checkAttributedApprover,
	everySliceReviewed,
	needsAttributedRound,
	unrecordedAttribution,
	withShippedIn,
} from '@delendai/proposals/lib/services/review-attribution';
import { EMPTY_REVIEW } from '@delendai/proposals/lib/swarm/proposal-review';

const PROPOSAL = (frontmatter: string, slices: string): string => `---
id: x00001
status: review
${frontmatter}---

## Slices

${slices}`;

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
	const attribution = {
		commit: 'c',
		implementer: 'Agent-A',
		source: 's',
		recorded: true,
	};

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

	it('lets anyone review an unsigned delivery, except under the reserved name', () => {
		const unsigned = unrecordedAttribution('c', 'nothing names the author');
		expect(checkAttributedApprover(unsigned, 'agent-b')).toEqual({
			ok: true,
		});
		expect(checkAttributedApprover(unsigned, 'Unrecorded').ok).toBe(false);
	});
});
