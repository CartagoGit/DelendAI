/**
 * A proposal keeps one work branch while it is in progress (f00642 S1):
 * a later slice continues on the branch the agent already has for it.
 */
import { describe, expect, it } from 'vitest';

import {
	liveProposalBranch,
	liveUnitsOfProposal,
} from '@delendai/core/lib/work-units/proposal-branch.service';

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

describe('liveUnitsOfProposal', () => {
	const unit = (agent: string, kind: string, proposal = 'f00001') =>
		`refs/heads/delendai/wip/${agent}/${kind}/${proposal}-S1-g1/t`;
	const T =
		'refs/heads/delendai/wip/${agent}/${kind}/${proposal}-${slice}-g${generation}/${topic}';

	it('lists the units that write the proposal, for the agent asking', () => {
		const found = liveUnitsOfProposal(
			T,
			listing(
				unit('agent-a', 'implement'),
				unit('agent-b', 'implement'),
				unit('agent-a', 'implement', 'f00002'),
			),
			{ proposal: 'f00001', agent: 'agent-a' },
		);
		expect(found.map((each) => each.agent)).toEqual(['agent-a']);
	});

	it('never lists a review or an audit, which do not write the proposal', () => {
		expect(
			liveUnitsOfProposal(
				T,
				listing(unit('agent-a', 'review'), unit('agent-a', 'audit')),
				{ proposal: 'f00001' },
			),
		).toEqual([]);
	});

	it('prefers the implementation over the creation unit', () => {
		const found = liveUnitsOfProposal(
			T,
			listing(unit('agent-a', 'create'), unit('agent-a', 'implement')),
			{ proposal: 'f00001' },
		);
		expect(found.map((each) => each.kind)).toEqual(['implement']);
	});

	it('falls back to the creation unit when that is the only one', () => {
		const found = liveUnitsOfProposal(
			T,
			listing(unit('agent-a', 'create')),
			{
				proposal: 'f00001',
			},
		);
		expect(found.map((each) => each.kind)).toEqual(['create']);
	});
});
