#!/usr/bin/env bun
/**
 * close-unpublished-prs.script.ts — a pull request that was not opened
 * from a publication is closed, with the reason (x00690).
 *
 * `lint:pr-head-shape` fails such a pull request in CI, and nothing acted
 * on the failure. The hydrator brings publications forward, and the queue
 * arms publications. A pull request opened by hand from a work ref is
 * neither, so it stayed open, red and falling behind for as long as
 * nobody closed it. #514 (`delendai/wip/minimax-3/review/…`) sat like that
 * from 2026-09-27 on.
 *
 * The queue closes it with a comment that says what is wrong and how to
 * publish. The branch is never touched: it may be the only copy of the
 * work, and publishing it is the way forward.
 *
 *   bun tools/scripts/forge/close-unpublished-prs.script.ts [--apply]
 */
import { execFileSync } from 'node:child_process';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';
import { prHeadProblem } from '../lint/pr-head-shape.script';

interface IOpenPullRequest {
	readonly number: number;
	readonly headRefName: string;
	readonly isCrossRepository: boolean;
}

/** The pull requests to close, each with the reason it gets. */
export const unpublishedPullRequests = (
	open: readonly IOpenPullRequest[],
	branches: Parameters<typeof prHeadProblem>[1],
): readonly { readonly number: number; readonly problem: string }[] =>
	open.flatMap((pull) => {
		// A fork's branch is not ours to judge by our namespaces.
		if (pull.isCrossRepository) return [];
		const problem = prHeadProblem(pull.headRefName, branches);
		return problem === undefined ? [] : [{ number: pull.number, problem }];
	});

/** The comment a closed pull request carries. */
export const closingComment = (problem: string): string =>
	[
		`Closed by the queue: ${problem}`,
		'',
		'Only a publication is validated, brought forward and merged. The branch was left as it is. From the worktree of the unit, run `delendai work publish` with the same `--kind`, `--proposal`, `--slice`, `--agent` and `--topic` it was entered with; it pushes the publication and opens its pull request.',
	].join('\n');

const main = (): number => {
	const root = repoRoot();
	const open = JSON.parse(
		execFileSync(
			'gh',
			[
				'pr',
				'list',
				'--state',
				'open',
				'--limit',
				'200',
				'--json',
				'number,headRefName,isCrossRepository',
			],
			{ cwd: root, encoding: 'utf8' },
		),
	) as readonly IOpenPullRequest[];
	const toClose = unpublishedPullRequests(open, declaredBranches(root));
	for (const { number, problem } of toClose) {
		if (!process.argv.includes('--apply')) {
			console.log(
				`close-unpublished-prs: #${String(number)} would be closed (read-only): ${problem}`,
			);
			continue;
		}
		execFileSync(
			'gh',
			[
				'pr',
				'close',
				String(number),
				'--comment',
				closingComment(problem),
			],
			{ cwd: root, stdio: 'ignore' },
		);
		console.log(
			`close-unpublished-prs: closed #${String(number)}: ${problem}`,
		);
	}
	if (toClose.length === 0) {
		console.log(
			'close-unpublished-prs: every open pull request comes from a publication.',
		);
	}
	return 0;
};

if (import.meta.main) process.exit(main());
