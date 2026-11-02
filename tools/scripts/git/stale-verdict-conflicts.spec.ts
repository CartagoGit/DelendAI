/**
 * stale-verdict-conflicts.spec.ts — a pack of verdicts in conflict gives
 * up the verdicts that conflict and lands the rest, on a real repository.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { refreshCandidate } from './refresh-candidate-artifacts.script';
import { proposalOfPath } from './stale-verdict-conflicts';

const roots: string[] = [];
const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});
const PROPOSALS = 'docs/delendai/proposals';
const PACK = 'delendai/pr/reviewer/review/batch-all-g1/verdicts';

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

/**
 * Two proposals in review; a pack that approves both and closes the
 * first; and an integration branch whose implementer rewrote the first
 * after the pack was opened.
 */
const repoWithConflictingPack = (branch: string): string => {
	const base = mkdtempSync(join(tmpdir(), 'stale-verdict-'));
	roots.push(base);
	const remote = join(base, 'origin.git');
	const root = join(base, 'work');
	mkdirSync(remote);
	mkdirSync(join(root, PROPOSALS, 'review'), { recursive: true });
	mkdirSync(join(root, PROPOSALS, 'done'), { recursive: true });
	git(remote, 'init', '-q', '--bare', '--initial-branch', 'develop');
	git(root, 'init', '-q', '--initial-branch', 'develop');
	git(root, 'config', 'user.email', 'c@example.com');
	git(root, 'config', 'user.name', 'C');
	git(root, 'config', 'commit.gpgsign', 'false');
	const first = join(PROPOSALS, 'review/x00001-first.md');
	const second = join(PROPOSALS, 'review/x00002-second.md');
	writeFileSync(
		join(root, first),
		'# first\n\n### S1 — work\n- **Status**: review\n',
	);
	writeFileSync(
		join(root, second),
		'# second\n\n### S1 — work\n- **Status**: review\n',
	);
	writeFileSync(join(root, PROPOSALS, 'done/.gitkeep'), '');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', 'develop');

	git(root, 'checkout', '-q', '-b', branch);
	writeFileSync(
		join(root, first),
		'# first\n\n### S1 — work\n- **Status**: done\n- review-log: approved by reviewer — fine\n',
	);
	git(root, 'mv', first, join(PROPOSALS, 'done/x00001-first.md'));
	writeFileSync(
		join(root, second),
		'# second\n\n### S1 — work\n- **Status**: done\n- review-log: approved by reviewer — fine\n',
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'verdicts');
	git(root, 'push', '-q', 'origin', branch);

	git(root, 'checkout', '-q', 'develop');
	writeFileSync(
		join(root, first),
		'# first\n\n### S1 — work, delivered again\n- **Status**: review\n- shipped-in: `abc1234`\n',
	);
	git(root, 'add', '-A');
	git(
		root,
		'commit',
		'-q',
		'-m',
		'the implementer publishes the first again',
	);
	git(root, 'push', '-q', 'origin', 'develop');
	git(root, 'fetch', '-q', 'origin');
	return root;
};

describe('a pack of verdicts whose document changed under it', () => {
	it('drops the verdicts on that document and keeps the others', () => {
		const root = repoWithConflictingPack(PACK);

		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: PACK,
			run: () => true,
		});

		expect(outcome.state).toBe('refreshed');
		expect(outcome.detail).toContain('dropped the verdicts on x00001');
		git(root, 'fetch', '-q', 'origin');
		const tip = `origin/${PACK}`;
		// The first proposal is where and as the integration branch has it.
		expect(
			git(root, 'show', `${tip}:${PROPOSALS}/review/x00001-first.md`),
		).toBe(
			git(
				root,
				'show',
				`origin/develop:${PROPOSALS}/review/x00001-first.md`,
			),
		);
		expect(git(root, 'ls-tree', '-r', '--name-only', tip)).not.toContain(
			'done/x00001-first.md',
		);
		// The second keeps its verdict.
		expect(
			git(root, 'show', `${tip}:${PROPOSALS}/review/x00002-second.md`),
		).toContain('approved by reviewer');
		expect(git(root, 'log', '-1', '--format=%B', tip)).toContain(
			'Dropped the verdicts on x00001',
		);
	});

	it('is left to its author when the unit is not one that records verdicts', () => {
		const implement = 'delendai/pr/author/implement/x00001-S1-g1/the-work';
		const root = repoWithConflictingPack(implement);

		const outcome = refreshCandidate({
			root,
			policy,
			remote: 'origin',
			candidate: implement,
			run: () => true,
		});

		expect(outcome.state).toBe('conflicted');
	});
});

describe('proposalOfPath', () => {
	it('names the proposal of a document under the proposals folder, and nothing else', () => {
		expect(
			proposalOfPath(`${PROPOSALS}/done/fixes/x00001-a.md`, PROPOSALS),
		).toBe('x00001');
		expect(proposalOfPath('docs/x00001-a.md', PROPOSALS)).toBeUndefined();
		expect(
			proposalOfPath(`${PROPOSALS}/README.md`, PROPOSALS),
		).toBeUndefined();
	});
});
