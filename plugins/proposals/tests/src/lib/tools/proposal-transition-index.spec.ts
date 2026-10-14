/**
 * proposal-transition-index.spec.ts — a proposal move in a checkout that
 * persists work through work refs leaves the shared index alone
 * (x00651 S1), on a real repository.
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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { movesStayOutOfTheIndex } from '@delendai/proposals/lib/shared/index-free-git-runner';
import { createGitRunner } from '@delendai/proposals/lib/shared/git-runner';
import { runProposalTransition } from '@delendai/proposals/lib/tools/proposal-transition.tool';

let root = '';

const git = (...args: string[]): string =>
	execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const PROPOSAL = `---
id: f93001
title: Moves
kind: feat
status: ready
type: proposal
---

# f93001 — Moves
`;

const transition = (indexFreeMoves: boolean) =>
	runProposalTransition(
		{ id: 'f93001', to: 'in-progress', reason: 'claimed' },
		{
			namespacePrefix: 'proposals',
			proposalsDirAbs: join(root, 'proposals'),
			workspaceRoot: root,
			gitRunner: createGitRunner(root),
			requirePeerReview: false,
			indexFreeMoves,
		},
	);

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'transition-index-'));
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'owner@example.com');
	git('config', 'user.name', 'Owner');
	git('config', 'commit.gpgsign', 'false');
	mkdirSync(join(root, 'proposals/ready'), { recursive: true });
	writeFileSync(join(root, 'proposals/ready/f93001-moves.md'), PROPOSAL);
	git('add', '.');
	git('commit', '-q', '--no-verify', '-m', 'base');
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('a proposal move and the shared index', () => {
	it('moves the file and stages nothing when work persists through work refs', async () => {
		await transition(true);

		expect(
			existsSync(join(root, 'proposals/in-progress/f93001-moves.md')),
		).toBe(true);
		expect(existsSync(join(root, 'proposals/ready/f93001-moves.md'))).toBe(
			false,
		);
		expect(git('diff', '--cached', '--name-only')).toBe('');
	});

	it('stages the move as before in a direct-commit checkout', async () => {
		await transition(false);

		expect(git('diff', '--cached', '--name-status')).toContain(
			'proposals/in-progress/f93001-moves.md',
		);
	});
});

describe('movesStayOutOfTheIndex', () => {
	it('follows whether the policy persists work through work refs', () => {
		const shared = resolveDevelopmentPolicy({
			development: { profile: 'shared-checkout-pr' },
		});
		expect(movesStayOutOfTheIndex(shared)).toBe(true);
		expect(movesStayOutOfTheIndex(undefined)).toBe(false);
		expect(
			movesStayOutOfTheIndex({ branches: { workRefTemplate: '' } }),
		).toBe(false);
	});
});
