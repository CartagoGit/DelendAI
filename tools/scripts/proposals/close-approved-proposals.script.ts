#!/usr/bin/env bun
/**
 * close-approved-proposals.script.ts — a proposal whose every slice is
 * independently approved reaches `done/` without anyone having to
 * remember to close it (x00700).
 *
 * The approval that finishes a proposal's last slice tries to close it
 * (`proposal_review` → `proposal_transition`), and the close is refused
 * while the integration branch's tip awaits certification. Nothing
 * retried it. On 2026-09-27 eight proposals GLM had approved slice by
 * slice sat in `review/` with every slice done and approved, and the
 * owner saw a review folder that never emptied.
 *
 * The owner machine's hydrator runs this on every pass. It reads the
 * proposals in `review/` on the integration branch, and closes those
 * whose finished slices all carry an approval by someone other than their
 * implementer (the rule `lint:closed-with-independent-approval` enforces)
 * and which record `shipped-in`. It does so in a review unit of its own,
 * through the same `runProposalTransition` every gate applies to, and
 * publishes one pull request, which goes through CI like any other. A
 * proposal marked `owner-decision: pending` waits for the owner.
 *
 *   bun tools/scripts/proposals/close-approved-proposals.script.ts [--apply]
 */
import { execFileSync } from 'node:child_process';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';
import { unapprovedSlices } from '../lint/closed-with-independent-approval.script';

const AGENT = 'delendai-queue';
const REVIEW_DIR = 'docs/delendai/proposals/review/';

/** Whether a proposal in review can be closed without anyone deciding. */
export const readyToClose = (markdown: string): boolean => {
	const frontmatter = markdown.split(/^---\s*$/mu)[1] ?? '';
	if (/^owner-decision:\s*pending/mu.test(frontmatter)) return false;
	if (!/^shipped-in:/mu.test(frontmatter)) return false;
	const statuses = [
		...markdown.matchAll(/^[-*]\s*\*\*Status\*\*:\s*([a-z-]+)/gimu),
	].map((match) => (match[1] ?? '').toLowerCase());
	if (statuses.length === 0 || statuses.some((status) => status !== 'done'))
		return false;
	return unapprovedSlices(markdown).length === 0;
};

const run = (command: string, args: readonly string[], cwd: string): string =>
	execFileSync(command, [...args], {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			// The owner's automation, not an agent's shell.
			CLAUDECODE: '',
			AI_AGENT: '',
			DELENDAI_AGENT_ID: '',
		},
	}).trim();

const UNIT_DIR = '.cache/delendai/.worktrees';

const tryRun = (
	command: string,
	args: readonly string[],
	cwd: string,
): string | undefined => {
	try {
		return run(command, args, cwd);
	} catch {
		return undefined;
	}
};

/**
 * This closer's publications on the remote, from `git ls-remote --heads`
 * output: the refs under the publication prefix that its agent owns.
 */
export const ownPublications = (
	listing: string,
	publicationRefPrefix: string,
): readonly { readonly ref: string; readonly sha: string }[] => {
	const prefix = `refs/heads/${publicationRefPrefix.replace(/^refs\/(heads\/)?/u, '')}`;
	return listing
		.split('\n')
		.map((line) => line.trim().split(/\s+/u))
		.flatMap(([sha, ref]) =>
			sha !== undefined && ref?.startsWith(`${prefix}${AGENT}/`) === true
				? [{ ref, sha }]
				: [],
		);
};

/** Remove every unit a pass of this closer entered, worktree and branch. */
const sweepOwnUnits = (root: string): void => {
	const listed =
		tryRun('git', ['worktree', 'list', '--porcelain'], root) ?? '';
	for (const block of listed.split('\n\n')) {
		const path = block.match(/^worktree (.+)$/mu)?.[1];
		const branch = block.match(/^branch refs\/heads\/(.+)$/mu)?.[1];
		if (path === undefined || !path.includes(`/${AGENT}-close-approved-`)) {
			continue;
		}
		tryRun('git', ['worktree', 'remove', '--force', path], root);
		if (branch !== undefined) tryRun('git', ['branch', '-D', branch], root);
	}
};

/** The reason a transition gave, read from what it printed. */
export const refusalOf = (error: unknown): string => {
	const printed = [
		(error as { stdout?: unknown }).stdout,
		(error as { stderr?: unknown }).stderr,
	]
		.map((stream) => (stream === undefined ? '' : String(stream)))
		.join('\n');
	const reported = printed
		.split('\n')
		.flatMap((text) => {
			try {
				const parsed = JSON.parse(text) as {
					readonly error?: unknown;
					readonly reason?: unknown;
				};
				return [
					[parsed.error, parsed.reason]
						.filter((part) => typeof part === 'string')
						.join(': '),
				];
			} catch {
				return [];
			}
		})
		.find((text) => text.length > 0);
	return (
		reported ??
		(printed.trim().split('\n').at(-1) || 'no reason printed').slice(0, 300)
	);
};

const main = (): number => {
	const root = repoRoot();
	// The remote-tracking ref when the clone keeps one, else the local
	// branch the shared checkout is kept level with.
	const branch = declaredBranches(root).integration;
	const integration = [
		`refs/remotes/origin/${branch}`,
		`refs/heads/${branch}`,
	].find((ref) => {
		try {
			run('git', ['rev-parse', '--verify', '--quiet', ref], root);
			return true;
		} catch {
			return false;
		}
	});
	if (integration === undefined) return 0;
	const candidates = run(
		'git',
		['ls-tree', '-r', '--name-only', integration, REVIEW_DIR],
		root,
	)
		.split('\n')
		.filter((path) => path.endsWith('.md') && !path.endsWith('README.md'))
		.filter((path) =>
			readyToClose(run('git', ['show', `${integration}:${path}`], root)),
		)
		.map((path) => (path.split('/').at(-1) ?? '').slice(0, 6));
	if (candidates.length === 0) {
		console.log(
			'close-approved-proposals: nothing in review is ready to close.',
		);
		return 0;
	}
	if (!process.argv.includes('--apply')) {
		console.log(
			`close-approved-proposals: ready to close (read-only): ${candidates.join(', ')}`,
		);
		return 0;
	}
	const branches = declaredBranches(root);
	sweepOwnUnits(root);
	const topic = `close-approved-${new Date().toISOString().slice(0, 16).replaceAll(/[-:T]/gu, '')}`;
	const unit = [
		'--kind=review',
		'--proposal=batch',
		'--slice=all',
		`--agent=${AGENT}`,
		`--topic=${topic}`,
		// Its own directory: a review batch's default one was shared by
		// every agent entering a batch before x00695.
		`--dir=${UNIT_DIR}/${AGENT}-${topic}`,
	];
	const cli = ['packages/cli/src/index.ts'];
	const entered = JSON.parse(
		run('bun', [...cli, 'work', 'enter', ...unit, '--json'], root),
	) as {
		readonly path?: string;
		readonly session?: string;
		readonly branch?: string;
	};
	const path = entered.path;
	if (path === undefined) return 1;
	try {
		// The closer's open pull request is where these closes go: the
		// publisher joins it. Built on it, the push is a fast-forward and
		// brings it level with the integration branch; built beside it,
		// every pass closed the same proposals again and could not push
		// (x00710), and a red pull request no author moved sat forever.
		const existing = ownPublications(
			tryRun('git', ['ls-remote', '--heads', 'origin'], root) ?? '',
			branches.publicationRefPrefix,
		)[0];
		if (existing !== undefined) {
			run('git', ['fetch', '--quiet', 'origin', existing.ref], path);
			if (
				tryRun('git', ['merge', '--no-edit', 'FETCH_HEAD'], path) ===
				undefined
			) {
				tryRun('git', ['merge', '--abort'], path);
				console.log(
					`close-approved-proposals: ${existing.ref} does not merge with ${branches.integration}; a person resolves it.`,
				);
				return 0;
			}
		}
		const inReview = run(
			'git',
			['ls-tree', '-r', '--name-only', 'HEAD', REVIEW_DIR],
			path,
		);
		const refusals = new Map<string, string>();
		const closed = candidates
			.filter((id) => inReview.includes(`/${id}-`))
			.filter((id) => {
				try {
					run(
						'bun',
						[
							`${root}/tools/scripts/proposals/transition-proposal.script.ts`,
							id,
							'done',
							'every slice independently approved',
						],
						path,
					);
					return true;
				} catch (error) {
					refusals.set(id, refusalOf(error));
					return false;
				}
			});
		// A refusal nobody reads is a close nobody can fix: every pass on
		// 2026-09-27 refused 37 closes and printed only that it had.
		for (const [id, reason] of refusals) {
			console.log(`close-approved-proposals: ${id} refused — ${reason}`);
		}
		if (closed.length > 0) {
			run('git', ['add', '-A'], path);
			run(
				'git',
				[
					'commit',
					'-q',
					'-m',
					`docs(proposals): close ${String(closed.length)} independently approved proposal(s)`,
					'-m',
					`${closed.join(', ')}: every finished slice approved by someone other than its implementer; closed by the owner machine after the reviewer's own close was refused.`,
				],
				path,
			);
		}
		const moved =
			existing !== undefined &&
			run('git', ['rev-parse', 'HEAD'], path) !== existing.sha;
		if (closed.length === 0 && !moved) {
			console.log(
				`close-approved-proposals: nothing new to close; ${existing === undefined ? 'no pull request is open' : `${existing.ref} is level`}.`,
			);
			return 0;
		}
		run(
			'bun',
			[
				...cli,
				'work',
				'publish',
				...unit.filter((arg) => !arg.startsWith('--dir=')),
				...(entered.session === undefined
					? []
					: [`--session=${entered.session}`]),
			],
			root,
		);
		console.log(
			closed.length > 0
				? `close-approved-proposals: published the close of ${closed.join(', ')}.`
				: `close-approved-proposals: brought ${existing?.ref ?? ''} level with ${branches.integration}.`,
		);
		return 0;
	} finally {
		// Published or not, the unit's worktree and branch end here: a pass
		// that failed to publish used to leave both behind, one per pass.
		sweepOwnUnits(root);
	}
};

if (import.meta.main) process.exit(main());
