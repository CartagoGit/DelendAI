/**
 * A proposal keeps one work branch while it is in progress (f00642 S1):
 * a later slice continues on the branch the agent already has for it.
 */
import { describe, expect, it } from 'vitest';

import { liveProposalBranch } from './proposal-branch.service';

const TEMPLATE =
	'refs/heads/delendai/wip/${agent}/${proposal}-${slice}-g${generation}/${topic}';

const listing = (...branches: readonly string[]): string =>
	branches
		.map(
			(branch, index) =>
				`worktree /repo/.wt/${String(index)}\nHEAD abc\nbranch ${branch}`,
		)
		.join('\n\n');

describe('liveProposalBranch', () => {
	it('continues a later slice on the branch the agent has for the proposal', () => {
		expect(
			liveProposalBranch(
				TEMPLATE,
				'refs/heads/delendai/wip/agent-a/f00001-S2-g1/second',
				listing('refs/heads/delendai/wip/agent-a/f00001-S1-g1/first'),
			),
		).toEqual({
			ref: 'refs/heads/delendai/wip/agent-a/f00001-S1-g1/first',
			path: '/repo/.wt/0',
		});
	});

	it('never joins another agent, another proposal or another generation', () => {
		const wanted = 'refs/heads/delendai/wip/agent-a/f00001-S2-g1/t';
		expect(
			liveProposalBranch(
				TEMPLATE,
				wanted,
				listing(
					'refs/heads/delendai/wip/agent-b/f00001-S1-g1/t',
					'refs/heads/delendai/wip/agent-a/f00002-S1-g1/t',
					'refs/heads/delendai/wip/agent-a/f00001-S1-g2/t',
				),
			),
		).toBeUndefined();
	});

	it('keeps a review round apart from implementation work, both ways', () => {
		expect(
			liveProposalBranch(
				TEMPLATE,
				'refs/heads/delendai/wip/agent-a/f00001-review-g1/t',
				listing('refs/heads/delendai/wip/agent-a/f00001-S1-g1/t'),
			),
		).toBeUndefined();
		expect(
			liveProposalBranch(
				TEMPLATE,
				'refs/heads/delendai/wip/agent-a/f00001-S2-g1/t',
				listing('refs/heads/delendai/wip/agent-a/f00001-review-g1/t'),
			),
		).toBeUndefined();
	});

	it('reads nothing from a ref outside the template', () => {
		expect(
			liveProposalBranch(
				TEMPLATE,
				'refs/heads/feature/x',
				listing('refs/heads/delendai/wip/agent-a/f00001-S1-g1/t'),
			),
		).toBeUndefined();
	});
});
