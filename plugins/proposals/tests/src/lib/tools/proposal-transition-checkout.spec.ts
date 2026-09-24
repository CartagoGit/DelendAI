/**
 * proposal-transition-checkout.spec.ts — x00608 S2.
 *
 * Driven against a real repository with a pinned checkout and a second
 * worktree on a work ref, because the defect this pins is invisible to a
 * fake filesystem: the tool answered `ok` and the rename had happened —
 * in the shared checkout, on the integration branch, not in the worktree
 * the caller was standing in.
 *
 * Two things are asserted together, and neither is enough alone: the
 * rename is in the worktree, AND the shared checkout is untouched.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	runProposalTransition,
	type IProposalTransitionToolOptions,
} from '@delendai/proposals/lib/tools/proposal-transition.tool';

const PROPOSAL_ID = 'x99608';
const PROPOSALS_REL = 'docs/delendai/proposals';

const git = (cwd: string, args: readonly string[]): string =>
	execFileSync('git', [...args], { cwd, encoding: 'utf8' });

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const document = `---
id: ${PROPOSAL_ID}
title: "A proposal that must move where the caller stands"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-23
---

# ${PROPOSAL_ID} — A proposal that must move where the caller stands

## goal

Be moved in the worktree that asked, and nowhere else.

## Slices

### S1 — The only slice

- **Status**: done
- **Gate**: none
- **Files**: \`docs/delendai/proposals/${PROPOSAL_ID}.md\`
`;

/** A repository with a pinned checkout and a worktree on a work ref. */
const repositoryWithWorktree = (): {
	readonly checkout: string;
	readonly worktree: string;
} => {
	const parent = mkdtempSync(join(tmpdir(), 'x00608-'));
	roots.push(parent);
	const checkout = join(parent, 'checkout');
	mkdirSync(join(checkout, PROPOSALS_REL, 'in-progress'), {
		recursive: true,
	});
	mkdirSync(join(checkout, PROPOSALS_REL, 'review'), { recursive: true });
	git(parent, ['init', '-b', 'develop', 'checkout']);
	git(checkout, ['config', 'user.email', 'spec@example.test']);
	git(checkout, ['config', 'user.name', 'Spec']);
	writeFileSync(
		join(checkout, PROPOSALS_REL, 'in-progress', `${PROPOSAL_ID}.md`),
		document,
		'utf8',
	);
	// An empty directory is not a tracked fact, and the worktree needs
	// the destination folder to exist for the rename to land.
	writeFileSync(
		join(checkout, PROPOSALS_REL, 'review', '.gitkeep'),
		'',
		'utf8',
	);
	git(checkout, ['add', '-A']);
	git(checkout, ['commit', '-m', 'the proposal in progress']);
	const worktree = join(parent, 'worktree');
	git(checkout, ['worktree', 'add', '-b', 'work', worktree, 'develop']);
	return { checkout, worktree };
};

const optionsFor = (checkout: string): IProposalTransitionToolOptions => ({
	namespacePrefix: 'proposals',
	workspaceRoot: checkout,
	proposalsDirAbs: join(checkout, PROPOSALS_REL),
	requirePeerReview: false,
	requireValidateEvidence: false,
});

describe('x00608 — a proposal write says which checkout it is for', () => {
	it('moves the proposal in the caller’s worktree and leaves the shared checkout clean', async () => {
		const { checkout, worktree } = repositoryWithWorktree();

		const result = await runProposalTransition(
			{
				id: PROPOSAL_ID,
				to: 'review',
				reason: 'x00608 S2 — the move belongs in the caller’s tree',
				checkout: worktree,
			},
			optionsFor(checkout),
		);

		expect(JSON.stringify(result)).not.toContain('"isError":true');

		// The rename is where the caller was standing.
		expect(
			existsSync(
				join(worktree, PROPOSALS_REL, 'review', `${PROPOSAL_ID}.md`),
			),
		).toBe(true);
		expect(
			existsSync(
				join(
					worktree,
					PROPOSALS_REL,
					'in-progress',
					`${PROPOSAL_ID}.md`,
				),
			),
		).toBe(false);

		// And the pinned checkout never saw it: no staged rename, no
		// working-tree change, the file still in `in-progress/`.
		expect(git(checkout, ['status', '--porcelain']).trim()).toBe('');
		expect(
			existsSync(
				join(
					checkout,
					PROPOSALS_REL,
					'in-progress',
					`${PROPOSAL_ID}.md`,
				),
			),
		).toBe(true);
	});

	it('refuses a checkout outside this repository rather than writing to it', async () => {
		const { checkout } = repositoryWithWorktree();
		const stranger = mkdtempSync(join(tmpdir(), 'x00608-stranger-'));
		roots.push(stranger);

		const result = await runProposalTransition(
			{
				id: PROPOSAL_ID,
				to: 'review',
				reason: 'x00608 S2 — a mistyped path must not be written to',
				checkout: stranger,
			},
			optionsFor(checkout),
		);

		const wire = JSON.stringify(result);
		expect(wire).toContain('"isError":true');
		expect(wire).toContain(stranger);
		// Nothing moved anywhere.
		expect(git(checkout, ['status', '--porcelain']).trim()).toBe('');
	});

	it('writes in the server’s own root when no checkout is named', async () => {
		const { checkout } = repositoryWithWorktree();

		const result = await runProposalTransition(
			{
				id: PROPOSAL_ID,
				to: 'review',
				reason: 'x00608 S2 — omitting the checkout keeps today’s behaviour',
			},
			optionsFor(checkout),
		);

		expect(JSON.stringify(result)).not.toContain('"isError":true');
		expect(
			existsSync(
				join(checkout, PROPOSALS_REL, 'review', `${PROPOSAL_ID}.md`),
			),
		).toBe(true);
	});
});
