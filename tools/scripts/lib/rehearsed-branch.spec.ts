import { describe, expect, it } from 'vitest';

import {
	branchInHand,
	REHEARSED_BRANCH_ENV,
	withRehearsedBranch,
} from './rehearsed-branch';
import { checkProposal, unitProposalOf } from '../lint/proposal-hygiene.script';

const UNIT = 'delendai/wip/a/implement/x00001-all-g1/the-fix';
const IN_PROGRESS = 'docs/delendai/proposals/in-progress/x00001-a.md';
const DELIVERED = [
	'---',
	'id: x00001',
	'---',
	'',
	'## slices',
	'',
	'### S1 — one',
	'- **Status**: review',
	'',
].join('\n');

describe('the branch a rehearsal stands in for', () => {
	it('[<20ms] gives the gates of a rehearsal the branch of the tree it rehearses', () => {
		const env = withRehearsedBranch({ CI: 'true' }, UNIT);
		expect(env[REHEARSED_BRANCH_ENV]).toBe(UNIT);
		expect(env.CI).toBe('true');
	});

	it('[<20ms] names no branch for a detached or empty HEAD', () => {
		const base = { CI: 'true' };
		expect(withRehearsedBranch(base, 'HEAD')).toBe(base);
		expect(withRehearsedBranch(base, '')).toBe(base);
		expect(withRehearsedBranch(base, undefined)).toBe(base);
	});

	it('[<20ms] reads the rehearsed branch only when the checkout has none of its own', () => {
		const env = { [REHEARSED_BRANCH_ENV]: UNIT };
		expect(branchInHand('HEAD', env)).toBe(UNIT);
		expect(branchInHand('', env)).toBe(UNIT);
		expect(branchInHand('develop', env)).toBe('develop');
		expect(branchInHand('HEAD', {})).toBe('HEAD');
	});

	it('[<50ms] lets proposal-hygiene exempt the reopened proposal of the rehearsed unit from a detached clone', () => {
		const env = withRehearsedBranch({}, UNIT);
		const inHand = unitProposalOf(branchInHand('HEAD', env));
		expect(checkProposal(IN_PROGRESS, DELIVERED, inHand)).toEqual([]);
		// Without the rehearsed branch the same detached clone flags it.
		expect(
			checkProposal(
				IN_PROGRESS,
				DELIVERED,
				unitProposalOf(branchInHand('HEAD', {})),
			),
		).not.toEqual([]);
	});
});
