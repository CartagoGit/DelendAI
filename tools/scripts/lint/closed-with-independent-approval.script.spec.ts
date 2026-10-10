/**
 * A proposal closes only with an independent approval (x00696).
 */
import { describe, expect, it } from 'vitest';

import {
	agentOfRef,
	approvalsAdded,
	kindOfRef,
	approvalsNotBy,
	labelsInEvent,
	linesAddedPerProposal,
	OWNER_RECONCILE_LABEL,
	ownerAuthorizedReconcile,
	unapprovedSlices,
	unclaimedProposals,
} from './closed-with-independent-approval.script';

const slice = (lines: string) => `### S1 — the work

- **Status**: done
${lines}
`;

describe('unapprovedSlices', () => {
	it('accepts a slice approved by someone other than its implementer', () => {
		expect(
			unapprovedSlices(
				slice(
					'- review-implementer: claude-opus-5-5\n- review-log: approved by glm-5.3-max — verified',
				),
			),
		).toEqual([]);
	});

	it('refuses a slice with no approval, or approved only by its implementer', () => {
		expect(
			unapprovedSlices(slice('- review-implementer: minimax-3')),
		).toEqual(['S1 — the work']);
		expect(
			unapprovedSlices(
				slice(
					'- review-implementer: minimax-3\n- review-log: approved by minimax-3 — mine',
				),
			),
		).toEqual(['S1 — the work']);
	});

	it('does not count a requested change as an approval', () => {
		expect(
			unapprovedSlices(
				slice(
					'- review-implementer: a\n- review-log: requested_changes by b — fix it',
				),
			),
		).toEqual(['S1 — the work']);
	});

	it('does not judge a heading that is not a slice (x00696)', () => {
		expect(
			unapprovedSlices(
				`${slice('- review-implementer: a\n- review-log: approved by b — ok')}\n### solid-compliance, 2026-09-08\n\nmeasured.\n`,
			),
		).toEqual([]);
	});

	it('judges only finished slices', () => {
		expect(
			unapprovedSlices(`### S2 — later

- **Status**: dropped
`),
		).toEqual([]);
	});
});

describe('an approval enters through its reviewer (x00715)', () => {
	const prefixes = ['delendai/pr/', 'heads/delendai/wip/'];

	it('reads the agent a ref belongs to, under any spelling of the prefix', () => {
		expect(
			agentOfRef('delendai/pr/glm-5/review/batch-all-g2/r', prefixes),
		).toBe('glm-5');
		expect(
			agentOfRef(
				'refs/heads/delendai/wip/minimax-m3/review/batch-all-g1/r',
				prefixes,
			),
		).toBe('minimax-m3');
		expect(agentOfRef('feature/owner-work', prefixes)).toBeUndefined();
	});

	it("names the approvals a diff adds that are not its author's", () => {
		const diff = [
			'+++ b/docs/delendai/proposals/review/x1.md',
			'+- review-log: approved by glm-5 — checked',
			'+- review-log: approved by minimax-m3 — checked',
			'-- review-log: approved by someone-removed — gone',
			' - review-log: approved by context-line — unchanged',
			'+- review-log: requested_changes by claude-opus-5 — no test',
		].join('\n');
		expect(approvalsNotBy(diff, 'glm-5')).toEqual(['minimax-m3']);
		expect(approvalsNotBy(diff, 'GLM-5')).toEqual(['minimax-m3']);
		expect(approvalsNotBy(diff, 'minimax-m3')).toEqual(['glm-5']);
	});
});

describe('an approval enters through a review unit (x00729)', () => {
	const prefixes = ['delendai/pr/', 'heads/delendai/wip/'];

	it('reads the kind of work a ref names', () => {
		expect(
			kindOfRef('delendai/pr/glm-5/review/batch-all-g2/r', prefixes),
		).toBe('review');
		expect(
			kindOfRef(
				'refs/heads/delendai/wip/minimax-m3/implement/x00001-S1-g1/t',
				prefixes,
			),
		).toBe('implement');
		expect(kindOfRef('delendai/pr/glm-5', prefixes)).toBeUndefined();
		expect(kindOfRef('feature/owner-work', prefixes)).toBeUndefined();
	});

	it('names every approval a diff adds, and nothing else', () => {
		const diff = [
			'+- review-log: approved by glm-5 — checked',
			'-- review-log: approved by gone — removed',
			'+- review-log: requested_changes by qwen — no test',
		].join('\n');
		expect(approvalsAdded(diff)).toEqual(['glm-5']);
	});
});

describe('the owner authorizes a reconciliation (x00743)', () => {
	it('reads the labels and the number of the pull request an event is for', () => {
		expect(
			labelsInEvent(
				JSON.stringify({
					pull_request: {
						number: 611,
						labels: [
							{ name: 'ci' },
							{ name: OWNER_RECONCILE_LABEL },
						],
					},
				}),
			),
		).toEqual({ labels: ['ci', OWNER_RECONCILE_LABEL], number: 611 });
	});

	it('authorizes nothing without the label, outside CI, or from a broken payload', () => {
		expect(ownerAuthorizedReconcile([OWNER_RECONCILE_LABEL])).toBe(true);
		expect(ownerAuthorizedReconcile(['reconcile', 'owner'])).toBe(false);
		expect(labelsInEvent(undefined)).toEqual({ labels: [] });
		expect(labelsInEvent('{not json')).toEqual({ labels: [] });
	});

	it('reads the kind of a reconciliation from its ref', () => {
		expect(
			kindOfRef(
				'delendai/pr/claude-opus-5-5/reconcile/batch-all-g1/swarm',
				['refs/heads/delendai/pr/'],
			),
		).toBe('reconcile');
	});
});

describe('unclaimedProposals', () => {
	const DIR = 'docs/delendai/proposals';

	it('names a proposal a pack changes and none of its commits claimed', () => {
		expect(
			unclaimedProposals(
				[
					`${DIR}/review/x00001-one.md`,
					`${DIR}/done/fixes/x00002-two.md`,
					`${DIR}/review/x00003-three.md`,
					`${DIR}/README.md`,
					'',
				],
				['x00001', ' X00003 ', ''],
			),
		).toEqual(['x00002']);
	});

	it('is empty for a pack that changes only what it claimed, wherever the document moved', () => {
		expect(
			unclaimedProposals(
				[
					`${DIR}/review/x00001-one.md`,
					`${DIR}/done/fixes/x00001-one.md`,
				],
				['x00001'],
			),
		).toEqual([]);
		expect(unclaimedProposals([], [])).toEqual([]);
	});
});

describe('linesAddedPerProposal', () => {
	const approved = '- review-log: approved by gpt-5.4';
	const files: Record<string, string> = {
		'base:docs/delendai/proposals/in-progress/r00040-barrel.md': [
			'# r00040',
			approved,
		].join('\n'),
		'head:docs/delendai/proposals/review/r00040-barrel.md': [
			'# r00040',
			approved,
			...Array.from(
				{ length: 40 },
				(_, index) => `- file ${String(index)}`,
			),
		].join('\n'),
	};
	const read = (side: 'base' | 'head', path: string): string =>
		files[`${side}:${path}`] ?? '';

	it('does not count an approval a moved proposal already carried', () => {
		// The move falls under git's rename similarity once the content
		// changes this much, so it arrives as a deletion and an addition.
		const added = linesAddedPerProposal(
			[
				{
					status: 'D',
					path: 'docs/delendai/proposals/in-progress/r00040-barrel.md',
				},
				{
					status: 'A',
					path: 'docs/delendai/proposals/review/r00040-barrel.md',
				},
			],
			read,
		);
		expect(approvalsAdded(added)).toEqual([]);
		expect(added).toContain('+- file 0');
	});

	it('counts an approval that is new in the moved proposal', () => {
		const added = linesAddedPerProposal(
			[
				{
					status: 'D',
					path: 'docs/delendai/proposals/in-progress/r00040-barrel.md',
				},
				{
					status: 'A',
					path: 'docs/delendai/proposals/review/r00040-barrel.md',
				},
			],
			(side, path) =>
				side === 'head'
					? `${read(side, path)}\n- review-log: approved by minimax-3`
					: read(side, path),
		);
		expect(approvalsAdded(added)).toEqual(['minimax-3']);
	});

	it('counts every approval of a proposal that did not exist before', () => {
		expect(
			approvalsAdded(
				linesAddedPerProposal(
					[
						{
							status: 'A',
							path: 'docs/delendai/proposals/review/r00040-barrel.md',
						},
					],
					read,
				),
			),
		).toEqual(['gpt-5.4']);
	});
});
