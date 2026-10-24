/**
 * taken-proposal-id.service.spec.ts — a create unit does not take an id
 * that is on the integration branch or another agent's.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { takenProposalId } from '@delendai/core/lib/work-units/taken-proposal-id.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const repo = (): ((...args: string[]) => string) & { root: string } => {
	const root = mkdtempSync(join(tmpdir(), 'taken-id-'));
	roots.push(root);
	const git = Object.assign(
		(...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' }),
		{ root },
	);
	git('init', '-q', '-b', 'develop');
	git('config', 'user.email', 'p@example.com');
	git('config', 'user.name', 'P');
	git('config', 'commit.gpgsign', 'false');
	mkdirSync(join(root, 'docs/delendai/proposals/ready/feats'), {
		recursive: true,
	});
	writeFileSync(
		join(root, 'docs/delendai/proposals/ready/feats/f00776-token-roi.md'),
		'---\nid: f00776\n---\n',
	);
	git('add', '-A');
	git('commit', '-q', '-m', 'docs: f00776');
	return git;
};

const create = ['--kind=create'];

describe('takenProposalId', () => {
	it('refuses a create unit on an id the integration branch already holds', () => {
		const git = repo();
		const result = takenProposalId(
			git.root,
			create,
			policy,
			'claude-opus-5-5',
			'f00776',
		);
		expect(result?.code).toBe(4);
		expect(result?.error).toContain('already exists on develop');
		expect(result?.error).toContain('allocated');
	});

	it("refuses an id another agent's unit or publication holds, here or on the forge", () => {
		const git = repo();
		git(
			'update-ref',
			'refs/remotes/origin/delendai/wip/minimax-m3.1-flash-preview/create/f00769-all-g1/stubs',
			'HEAD',
		);
		expect(
			takenProposalId(
				git.root,
				create,
				policy,
				'claude-opus-5-5',
				'f00769',
			)?.error,
		).toContain("another agent's unit");
		git(
			'update-ref',
			'refs/heads/delendai/pr/gpt-6.1-sol/create/f00790-all-g1/x',
			'HEAD',
		);
		expect(
			takenProposalId(
				git.root,
				create,
				policy,
				'claude-opus-5-5',
				'f00790',
			)?.code,
		).toBe(4);
	});

	it('lets through a free id, the agent its own units, and every other kind', () => {
		const git = repo();
		git(
			'update-ref',
			'refs/heads/delendai/wip/claude-opus-5-5/create/f00791-all-g1/mine',
			'HEAD',
		);
		expect(
			takenProposalId(
				git.root,
				create,
				policy,
				'claude-opus-5-5',
				'f00791',
			),
		).toBeUndefined();
		expect(
			takenProposalId(
				git.root,
				create,
				policy,
				'claude-opus-5-5',
				'f00800',
			),
		).toBeUndefined();
		git(
			'update-ref',
			'refs/remotes/origin/delendai/wip/gpt-6.1-sol/create/new-all-g1/theirs',
			'HEAD',
		);
		expect(
			takenProposalId(git.root, create, policy, 'claude-opus-5-5', 'new'),
		).toBeUndefined();
		expect(
			takenProposalId(
				git.root,
				['--kind=implement'],
				policy,
				'claude-opus-5-5',
				'f00776',
			),
		).toBeUndefined();
	});
});
