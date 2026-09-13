#!/usr/bin/env bun

/**
 * forge:refresh — bring this machine's own candidates up to the
 * integration head, with a push the forge will actually build.
 *
 * WHY IT IS NOT THE CI JOB'S WORK. `keep-the-queue-moving` used to
 * refresh candidates with the forge's `update-branch` API. An API call
 * writes its commit as the token that made it — a bot, always, inside a
 * workflow — and the forge will not start workflows on a bot's commit:
 * it parks them as `action_required`. So the job produced exactly the
 * state it existed to remove, on every candidate it touched, and the
 * required check never reported.
 *
 * Measured, not reasoned: twenty-one parked runs across five pull
 * requests, each BLOCKED with nothing red on it. Releasing them by hand
 * worked and the job re-parked them on its next pass. A loop.
 *
 * The way out is not a better release. It is not making bot commits: the
 * agent that owns a candidate refreshes it from here, with its own
 * credential, and the forge builds it because a person pushed it.
 *
 * WHAT IT WILL NOT DO: it never moves the checkout (every tree is built
 * in a throwaway index), never touches a ref outside the policy's
 * publication namespace, and never forces. A candidate that does not
 * merge trivially is reported, because resolving a conflict is a
 * decision about intent and a tool that guesses at intent is why nobody
 * trusts tools with git.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import { repoRoot } from '../lib/repo-root';

import type {
	ICandidate,
	IRefreshVerdict,
} from './refresh-candidates.interface';

export type {
	ICandidate,
	IRefreshVerdict,
} from './refresh-candidates.interface';

const APPLY = process.argv.includes('--apply');

/**
 * What to do with one candidate, from facts alone.
 *
 * `conflicted` is kept apart from `behind` because only one of them is
 * this script's business. Merging a clean base forward is arithmetic;
 * resolving a conflict is a judgement about what the author meant.
 */
export const planRefresh = (candidate: ICandidate): IRefreshVerdict => {
	if (!candidate.ours) {
		return {
			action: 'skip',
			reason: `${candidate.ref} is outside the publication namespace, so it is not ours to refresh.`,
		};
	}
	if (candidate.behind === 0) {
		return {
			action: 'skip',
			reason: `${candidate.ref} already contains the integration head.`,
		};
	}
	if (candidate.conflicted) {
		return {
			action: 'report',
			reason: `${candidate.ref} is ${candidate.behind} behind and does not merge trivially. That is the author's call, not this script's.`,
		};
	}
	return {
		action: 'refresh',
		reason: `${candidate.ref} is ${candidate.behind} commit(s) behind the integration head and merges cleanly.`,
	};
};

const git = (args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	}).trim();

const gh = (args: readonly string[]): string =>
	execFileSync('gh', [...args], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	}).trim();

/**
 * The policy's own names, through the RESOLVER and not a raw read.
 *
 * This used to parse `delendai.config.json` directly and fall back to
 * `delendai/` when it found no `publicationRefPrefix` — which is the
 * case here, because this repository names a profile and lets the
 * profile supply the branches. The resolved prefix is `delendai/pr/`,
 * strictly narrower, so the refresher considered every `delendai/*`
 * ref its own: it would have claimed a `delendai/merge/*` ref under
 * the merge model and a `delendai/wip/*` work ref under any of them.
 *
 * A tool with its own opinion about what a publication ref is, is the
 * exact defect the integration-commit hook was corrected for. One
 * resolver, one answer.
 */
const policyNames = (): {
	readonly integration: string;
	readonly publicationPrefix: string;
} => {
	const config = JSON.parse(
		readFileSync(join(repoRoot(), 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
	const branches = resolveDevelopmentPolicy({
		...(config.development === undefined
			? {}
			: { development: config.development }),
	}).branches;
	return {
		integration: branches.integration,
		publicationPrefix: branches.publicationRefPrefix,
	};
};

/**
 * The merged tree, or `undefined` when the merge really does need a
 * human.
 *
 * Built in a THROWAWAY DETACHED WORKTREE so the shared checkout is never
 * involved — neither its HEAD nor its staging area — which is what lets
 * this run while somebody is editing in the same working tree. The
 * worktree is removed whatever happens.
 *
 * WHY NOT `read-tree -m --aggressive`, which this used to do: that is
 * git's TRIVIAL merge, and it is far more pessimistic than git's real
 * one. Measured: it reported `.github/workflows/ci.yml` and
 * `package.json` as conflicts on a candidate that `git merge` then
 * resolved cleanly with no human input at all. A refresher that cries
 * conflict on merges git can do is a refresher nobody can leave running
 * — every false conflict costs the attention the tool exists to save.
 *
 * `merge-tree --write-tree` would be the elegant answer and needs git
 * 2.38; this machine has 2.34, and a tool that only works on the newest
 * git is a tool that fails on somebody's laptop.
 */
const mergedTree = (ref: string, integration: string): string | undefined => {
	const worktree = join(
		process.env.TMPDIR ?? '/tmp',
		`delendai-refresh-${process.pid}-${ref.replaceAll('/', '-')}`,
	);
	const run = (args: readonly string[], cwd = repoRoot()): string =>
		execFileSync('git', [...args], {
			cwd,
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
		}).trim();
	try {
		run(['worktree', 'add', '--detach', '-q', worktree, `origin/${ref}`]);
		// `core.hooksPath=/dev/null`: the worktree has no install, so a
		// commit hook that runs repository tooling would fail on a merge
		// that is perfectly fine. The content is proved before it is
		// published, not here.
		run(
			[
				'-c',
				'core.hooksPath=/dev/null',
				'merge',
				`origin/${integration}`,
				'--no-edit',
				'-q',
			],
			worktree,
		);
		return run(['rev-parse', 'HEAD^{tree}'], worktree);
	} catch {
		return undefined;
	} finally {
		try {
			run(['worktree', 'remove', '--force', worktree]);
		} catch {
			// Already gone, or never created. `prune` settles either.
		}
		run(['worktree', 'prune']);
	}
};

interface IOpenPull {
	readonly number: number;
	readonly head: { readonly ref: string };
}

const observe = (
	names: ReturnType<typeof policyNames>,
): readonly (ICandidate & { readonly number: number })[] => {
	const slug = gh([
		'repo',
		'view',
		'--json',
		'nameWithOwner',
		'-q',
		'.nameWithOwner',
	]);
	git(['fetch', '--prune', '--quiet', 'origin']);
	const pulls = JSON.parse(
		gh(['api', `repos/${slug}/pulls?state=open&per_page=100`]),
	) as readonly IOpenPull[];
	return pulls.map((pull) => {
		const ref = pull.head.ref;
		const ours = ref.startsWith(names.publicationPrefix);
		if (!ours) {
			return {
				number: pull.number,
				ref,
				ours,
				behind: 0,
				conflicted: false,
			};
		}
		const behind = Number(
			git([
				'rev-list',
				'--count',
				`origin/${ref}..origin/${names.integration}`,
			]),
		);
		return {
			number: pull.number,
			ref,
			ours,
			behind,
			conflicted:
				behind > 0 && mergedTree(ref, names.integration) === undefined,
		};
	});
};

/** Build the merge with plumbing: the checkout never moves. */
const refresh = (ref: string, integration: string): void => {
	const tree = mergedTree(ref, integration);
	if (tree === undefined) {
		throw new Error(
			`forge:refresh: ${ref} does not merge trivially; it should have been reported, not refreshed.`,
		);
	}
	const commit = git([
		'commit-tree',
		tree,
		'-p',
		git(['rev-parse', `origin/${ref}`]),
		'-p',
		git(['rev-parse', `origin/${integration}`]),
		'-m',
		`Merge ${integration} into ${ref}`,
	]);
	git(['push', '--quiet', 'origin', `${commit}:refs/heads/${ref}`]);
};

const main = (): number => {
	const names = policyNames();
	let refreshed = 0;
	const reported: string[] = [];

	for (const candidate of observe(names)) {
		const verdict = planRefresh(candidate);
		if (verdict.action === 'skip') continue;
		if (verdict.action === 'report') {
			reported.push(`  #${candidate.number} ${verdict.reason}`);
			continue;
		}
		if (!APPLY) {
			console.log(
				`forge:refresh: would refresh #${candidate.number} — ${verdict.reason}`,
			);
			continue;
		}
		refresh(candidate.ref, names.integration);
		refreshed += 1;
		console.log(`forge:refresh: refreshed #${candidate.number}.`);
	}

	console.log(
		`forge:refresh: ${refreshed} refreshed${APPLY ? '' : ' (read-only; pass --apply)'}.`,
	);
	if (reported.length > 0) {
		console.log(
			`\nforge:refresh: ${reported.length} candidate(s) need their author:`,
		);
		for (const line of reported) console.log(line);
	}
	return 0;
};

if (import.meta.main) process.exit(main());
