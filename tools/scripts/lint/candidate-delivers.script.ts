#!/usr/bin/env bun

/**
 * lint:candidate-delivers — a pull request must change something.
 *
 * THE INCIDENT. GitHub recorded #100 as:
 *
 *     merged: true
 *     changed_files: 0
 *     additions: 0
 *     deletions: 0
 *
 * under a title and body describing a twenty-two file CI redesign —
 * named test zones, scoped validation, changed-file coverage, the
 * removal of `tier1.yml`. None of it is on `develop`. The eight shards
 * it replaced still are. Every check was green, because there was
 * nothing to be red about.
 *
 * The cause was a shell one, and it is worth naming so nobody looks for
 * a cleverer explanation: zsh does not word-split an unquoted `$PATHS`,
 * so twenty-three paths arrived at the publisher as ONE argument, and
 * `git update-index --force-remove` on a path the index has never heard
 * of exits zero. No command failed. The tree came out byte-identical to
 * the integration branch and the push reported success.
 *
 * WHY THE CHECK LIVES HERE TOO. `forge:publish` now refuses to build
 * such a tree, and that is the better place to stop it — at the moment
 * it happens, with the author still present. But a candidate can be
 * emptied by anything that writes a ref: another tool, a refresh, a
 * force-push, a person. This check asks the only question that matters
 * at the merge boundary, of whatever actually arrived:
 *
 *     does this pull request deliver anything at all?
 *
 * It is deliberately not a diff-digest comparison. A receipt that
 * records what the candidate was meant to be is the stronger property
 * and it is coming; this is the one-line version that cannot be
 * satisfied by an empty tree, costs a second, and would have blocked
 * #100 outright.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/monorepo-paths';
import type { IDeliveryVerdict } from './candidate-delivers.interface';

export type { IDeliveryVerdict } from './candidate-delivers.interface';

/**
 * Decide from the changed-path list alone, so the verdict is testable
 * without a forge or a second branch.
 */
export const judgeDelivery = (
	changed: readonly string[],
	base: string,
	head: string,
): IDeliveryVerdict =>
	changed.length > 0
		? { kind: 'delivers', changed: changed.length }
		: {
				kind: 'empty',
				reason: `${head} is byte-identical to ${base}: this pull request would merge and deliver nothing. That is how #100 landed a twenty-two file CI redesign as zero files.`,
			};

const git = (args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});

/**
 * What the FORGE says this pull request changes.
 *
 * WHY ask the forge rather than git: this check runs in a job that
 * checks out at depth 1, so neither `origin/develop` nor the base SHA is
 * an object the runner has — the git form died with `NOT EXECUTABLE`,
 * which was honest and still useless. And the forge's own
 * `changed_files` is the exact number that lied about #100: it recorded
 * `merged: true, changed_files: 0` under a title describing a
 * twenty-two file redesign. Asking the authority the same question it
 * got wrong is the point.
 *
 * `undefined` means "could not ask", never "zero". A gate that cannot
 * reach the forge must fall through to git, not conclude anything.
 */
export const forgeChangedFiles = (
	eventPath: string | undefined,
	ask: (owner: string, repo: string, number: number) => string,
	read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): number | undefined => {
	try {
		const event = readPullRequestEvent(eventPath, read);
		if (event?.number === undefined) return undefined;
		const answer = Number.parseInt(
			ask(event.owner, event.repo, event.number).trim(),
			10,
		);
		return Number.isNaN(answer) ? undefined : answer;
	} catch {
		return undefined;
	}
};

/**
 * The pull request a workflow event describes, or `undefined` when the
 * event is not one. Throws on an unreadable event; callers treat that as
 * "could not ask".
 */
const readPullRequestEvent = (
	eventPath: string | undefined,
	read: (path: string) => string,
) => {
	if (eventPath === undefined || eventPath === '') return undefined;
	const event = JSON.parse(read(eventPath)) as {
		readonly pull_request?: {
			readonly number?: number;
			readonly head?: { readonly sha?: string };
			readonly base?: { readonly ref?: string };
		};
		readonly repository?: {
			readonly name?: string;
			readonly owner?: { readonly login?: string };
		};
	};
	const repo = event.repository?.name;
	const owner = event.repository?.owner?.login;
	if (event.pull_request === undefined) return undefined;
	if (repo === undefined || owner === undefined) return undefined;
	return {
		owner,
		repo,
		number: event.pull_request.number,
		head: event.pull_request.head?.sha,
		base: event.pull_request.base?.ref,
	};
};

/**
 * Whether an empty candidate is the release branch coming back.
 *
 * Promoting the integration branch leaves a merge commit that only the
 * release branch has, and carrying it back changes no file: the trees
 * are already identical. That pull request delivers ANCESTRY, not paths,
 * and refusing it keeps the integration branch behind the branch it
 * releases to for good — measured at "1 behind" for every promotion.
 *
 * The exemption is exactly as wide as that fact: the release tip must be
 * in the candidate's history and NOT in its base's. A candidate emptied
 * by accident, the #100 shape, carries no such tip and is still refused.
 * A fact that could not be established exempts nothing.
 */
export const judgeReleaseSync = (facts: {
	readonly releaseInHead: boolean | undefined;
	readonly releaseInBase: boolean | undefined;
}): boolean => facts.releaseInHead === true && facts.releaseInBase === false;

/** A `release...ref` comparison with one of these means ref contains release. */
const CONTAINS_RELEASE: ReadonlySet<string> = new Set(['ahead', 'identical']);

/**
 * The release-sync question, asked of the forge for this pull request.
 *
 * `compare` answers the forge's `status` for `base...head`. The base is
 * compared by branch name, not by the event's base SHA: the question is
 * whether the branch this merges into still lacks the release tip.
 */
export const forgeReleaseSync = (
	eventPath: string | undefined,
	release: string,
	compare: (
		owner: string,
		repo: string,
		base: string,
		head: string,
	) => string,
	read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): boolean | undefined => {
	try {
		const event = readPullRequestEvent(eventPath, read);
		if (event?.head === undefined || event.base === undefined) {
			return undefined;
		}
		const contains = (ref: string): boolean =>
			CONTAINS_RELEASE.has(
				compare(event.owner, event.repo, release, ref).trim(),
			);
		return judgeReleaseSync({
			releaseInHead: contains(event.head),
			releaseInBase: contains(event.base),
		});
	} catch {
		return undefined;
	}
};

const RELEASE_SYNC_ACCEPTED =
	'✓ candidate-delivers: no file changes, and none are expected — this pull request brings the release branch back into its base, and delivers that history.\n';

const arg = (name: string): string | undefined => {
	const hit = process.argv.find((each) => each.startsWith(`--${name}=`));
	return hit?.slice(name.length + 3);
};

/**
 * The first base ref that this clone can actually resolve.
 *
 * CI checks out shallow, so `origin/develop` is frequently not an object
 * the runner has — the first version of this check died on
 * `git diff origin/develop...HEAD` with a raw `Command failed`. A gate
 * that cannot run must say so in those words: reporting NOT_EXECUTABLE
 * as PASS is the failure mode this repository has a tri-state verdict
 * to avoid.
 */
export const firstResolvable = (
	candidates: readonly string[],
	resolves: (ref: string) => boolean,
): string | undefined => candidates.find((ref) => ref !== '' && resolves(ref));

const main = (): number => {
	const head = arg('head') ?? 'HEAD';

	// The forge first: it is the authority on what a pull request
	// delivers, and it needs no git history to answer.
	const fromForge = forgeChangedFiles(
		process.env.GITHUB_EVENT_PATH,
		(owner, repo, number) =>
			execFileSync(
				'gh',
				[
					'api',
					`repos/${owner}/${repo}/pulls/${String(number)}`,
					'--jq',
					'.changed_files',
				],
				{ encoding: 'utf8' },
			),
	);
	if (fromForge !== undefined) {
		if (fromForge > 0) {
			process.stdout.write(
				`✓ candidate-delivers: the forge reports ${String(fromForge)} changed file(s)\n`,
			);
			return 0;
		}
		const releaseSync = forgeReleaseSync(
			process.env.GITHUB_EVENT_PATH,
			declaredBranches().release,
			(owner, repo, base, head) =>
				execFileSync(
					'gh',
					[
						'api',
						`repos/${owner}/${repo}/compare/${base}...${head}`,
						'--jq',
						'.status',
					],
					{ encoding: 'utf8' },
				),
		);
		if (releaseSync === true) {
			process.stdout.write(RELEASE_SYNC_ACCEPTED);
			return 0;
		}
		process.stderr.write(
			[
				'✗ candidate-delivers: the forge reports 0 changed files.',
				'',
				'  This pull request would merge and deliver nothing. #100 did',
				'  exactly that, under a title describing a twenty-two file CI',
				'  redesign, with every check green.',
				'',
				'next-action:',
				'  republish with `bun run forge:publish`, which refuses to build',
				'  a tree identical to the integration branch, and read the path',
				'  list it prints before you push.',
				'',
			].join('\n'),
		);
		return 1;
	}

	const resolves = (ref: string): boolean => {
		try {
			git(['rev-parse', '--verify', `${ref}^{commit}`]);
			return true;
		} catch {
			return false;
		}
	};
	// A push to the integration branch is not a candidate. This check
	// asks "does this pull request deliver anything", and on a push
	// there is no pull request to ask about: the base resolves to the
	// branch itself, the diff is empty by construction, and the check
	// declares that a change delivering twenty files delivers nothing.
	// Observed as lint-security failing on EVERY push to develop, which
	// left the integration branch permanently red for a question that
	// did not apply to it.
	//
	// NOT_APPLICABLE, not NOT_EXECUTABLE: the property is not
	// unverifiable here, it is not this event's property at all.
	if (
		process.env.GITHUB_EVENT_NAME !== undefined &&
		process.env.GITHUB_EVENT_NAME !== 'pull_request' &&
		process.env.GITHUB_EVENT_NAME !== 'merge_group'
	) {
		process.stdout.write(
			`✓ candidate-delivers: NOT_APPLICABLE on a \`${process.env.GITHUB_EVENT_NAME}\` event — emptiness is a property of a pull request, and this is not one.\n`,
		);
		return 0;
	}

	const base = firstResolvable(
		[
			arg('base') ?? '',
			process.env.GITHUB_BASE_SHA ?? '',
			`origin/${process.env.GITHUB_BASE_REF ?? ''}`,
			process.env.GITHUB_BASE_REF ?? '',
			'origin/develop',
		],
		resolves,
	);
	if (base === undefined) {
		process.stderr.write(
			[
				'✗ candidate-delivers: NOT EXECUTABLE — no base ref this clone can resolve.',
				'',
				'  Tried --base, GITHUB_BASE_SHA, GITHUB_BASE_REF and origin/develop.',
				'  A shallow checkout has none of them unless the job asks for',
				'  them, and a check that cannot run must not report success.',
				'',
				'next-action:',
				'  pass --base=<sha the runner has>, e.g.',
				'  `github.event.pull_request.base.sha`.',
				'',
			].join('\n'),
		);
		return 1;
	}
	// `-z` and NUL splitting: a path may contain a space, a quote or a
	// newline, and reconstructing git's quoting by hand is the bug class
	// that produced this check in the first place.
	const changed = git(['diff', '--name-only', '-z', `${base}...${head}`])
		.split('\0')
		.filter((path) => path !== '');
	const verdict = judgeDelivery(changed, base, head);
	if (verdict.kind === 'delivers') {
		process.stdout.write(
			`✓ candidate-delivers: ${String(verdict.changed)} changed path(s) against ${base}\n`,
		);
		return 0;
	}
	const release = `origin/${declaredBranches().release}`;
	const containsRelease = (ref: string): boolean => {
		try {
			git(['merge-base', '--is-ancestor', release, ref]);
			return true;
		} catch {
			return false;
		}
	};
	if (
		resolves(release) &&
		judgeReleaseSync({
			releaseInHead: containsRelease(head),
			releaseInBase: containsRelease(base),
		})
	) {
		process.stdout.write(RELEASE_SYNC_ACCEPTED);
		return 0;
	}
	process.stderr.write(
		[
			'✗ candidate-delivers: this pull request delivers nothing.',
			'',
			`  ${verdict.reason}`,
			'',
			'next-action:',
			'  republish the candidate with `bun run forge:publish`, which',
			'  refuses to build a tree identical to the integration branch,',
			'  and check the path list it prints before you push.',
			'',
		].join('\n'),
	);
	return 1;
};

if (import.meta.main) {
	process.exit(main());
}
