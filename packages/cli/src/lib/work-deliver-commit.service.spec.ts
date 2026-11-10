/**
 * work-deliver-commit.service.spec.ts — the tool commits what it wrote,
 * and only that.
 */
import { describe, expect, it } from 'vitest';

import {
	commitToolWrites,
	dirtyPathsOf,
	toolCommitSubject,
} from './work-deliver-commit.service';
import type { IGitInCheckout } from '../contracts/interfaces/git-in-checkout.interface';

const gitWith = (dirty: readonly string[], failOn?: string) => {
	const calls: (readonly string[])[] = [];
	const git: IGitInCheckout = (args) => {
		calls.push(args);
		if (args[0] === 'status') {
			return { ok: true, out: dirty.map((p) => ` M ${p}\0`).join('') };
		}
		return args[0] === failOn
			? { ok: false, out: `${args[0] ?? ''} refused` }
			: { ok: true, out: '' };
	};
	return { calls, git };
};

const SUBJECT = toolCommitSubject(
	'delendai_proposals_proposal_transition',
	'x1 in-progress',
);

describe('commitToolWrites', () => {
	it('[<20ms] reads the changed paths out of the porcelain listing', () => {
		expect([...dirtyPathsOf(gitWith(['a.md', 'b.ts']).git)]).toEqual([
			'a.md',
			'b.ts',
		]);
	});

	it('[<20ms] commits the path the tool wrote under the tool subject', () => {
		const { calls, git } = gitWith(['doc.md']);
		expect(commitToolWrites(git, new Set(), SUBJECT)).toBeUndefined();
		expect(calls.map((args) => args[0])).toEqual([
			'status',
			'add',
			'commit',
		]);
		expect(calls[2]).toContain(
			'chore(delendai): delendai_proposals_proposal_transition x1 in-progress',
		);
	});

	it('[<20ms] leaves a file that was dirty before the call to its owner', () => {
		const { calls, git } = gitWith(['doc.md', 'foreign.ts']);
		commitToolWrites(git, new Set(['foreign.ts']), SUBJECT);
		expect(calls[1]).toEqual(['add', '--', 'doc.md']);
		expect(calls[2]).toEqual([
			'commit',
			'-q',
			'-m',
			SUBJECT,
			'--',
			'doc.md',
		]);
	});

	it('[<20ms] commits nothing when the tool wrote nothing', () => {
		const { calls, git } = gitWith(['foreign.ts']);
		expect(
			commitToolWrites(git, new Set(['foreign.ts']), SUBJECT),
		).toBeUndefined();
		expect(calls).toHaveLength(1);
	});

	it('[<20ms] says why a commit was refused', () => {
		const { git } = gitWith(['doc.md'], 'commit');
		expect(commitToolWrites(git, new Set(), SUBJECT)).toBe(
			'commit refused',
		);
	});
});
