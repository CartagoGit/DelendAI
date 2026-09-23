#!/usr/bin/env bun

/**
 * ref-lifecycle-guard — no branch in this repository may be nobody's.
 *
 * WHY a guard and not a convention: this repository has now twice grown
 * a branch that an agent developed on and then left behind. Each one
 * looked reasonable when it was created. The model says agents own work
 * and not branches, and a model enforced by remembering is a model that
 * holds until the first busy day.
 *
 * The verdict is computed by `reconcileRefs` in core, so the rule this
 * guard applies is the same one the runtime applies — there is one
 * classifier, not a lint copy that can drift from it.
 *
 * A finished pull request's ref is deleted rather than reported: its
 * content is provably in the integration branch. A ref with NO pull
 * request is reported and never touched, because it may be the only
 * copy of work somebody is holding. `--reap` performs the deletions
 * that carry evidence; without it the guard only reports.
 *
 * WHY this guard asks a second question of the forge: publishing a ref
 * and opening its pull request are two calls, and this guard running on
 * the integration branch between them failed the whole run over a
 * candidate that was healthy seconds later. So the refs that look
 * unclaimed — usually none, occasionally one — get their tip date
 * fetched, and `reconcileRefs` decides from age whether "no pull
 * request" means abandoned or still arriving. Only those refs are
 * queried, so the extra cost is zero on a healthy repository.
 */

import { execFileSync } from 'node:child_process';

import { REPOSITORY_SLUG } from '@delendai/core/lib/contracts/constants/repository-identity.constant';
import {
	reconcileRefs,
	type IObservedPullRequest,
} from '@delendai/core/lib/ref-lifecycle/reconcile.service';

// `monorepo-paths` rather than a hardcoded path: the layout convention
// is that every consumer of these paths imports the path module. This
// guard needs `node_modules` regardless — it resolves the policy through
// core — so the import-lean constraint that applies to
// `branch-protection-guard` does not apply here.
import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/monorepo-paths';

const REAP = process.argv.includes('--reap');

const ghScalar = (path: string, jq: string): string =>
	execFileSync('gh', ['api', path, '--jq', jq], {
		encoding: 'utf8',
	}).trim();

const gh = (path: string): unknown => {
	const raw = execFileSync('gh', ['api', '--paginate', path, '--jq', '.[]'], {
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});
	return raw
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => JSON.parse(line) as unknown);
};

/** Strip `refs/` and `heads/` so a qualified prefix matches a branch name. */
const shortRef = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

export interface IBranchTip {
	readonly name: string;
	readonly sha: string;
}

/**
 * The branch that already carries a work ref's tip, if any: a publication
 * ref, or the integration branch once the work merged. Equal tips need no
 * lookup; otherwise `contains(base, head)` asks whether `head` is an
 * ancestor of `base`. Pure apart from that injected check, so the rule
 * can be specified without a forge.
 */
export const publishedInFor = (
	work: IBranchTip,
	containers: readonly IBranchTip[],
	contains: (baseSha: string, headSha: string) => boolean,
): string | undefined =>
	containers.find(
		(container) =>
			container.sha === work.sha || contains(container.sha, work.sha),
	)?.name;

const pullRequestState = (request: {
	readonly state: string;
	readonly merged_at: string | null;
}): IObservedPullRequest['state'] => {
	if (request.state === 'open') return 'open';
	return request.merged_at === null ? 'closed' : 'merged';
};

/**
 * Does `base` already contain `head`? Asked of git, in this clone.
 *
 * WHY git first, which is the whole of this change: this was one forge
 * `compare` call per work ref per container. On a repository carrying
 * eighty unpublished work refs that is hundreds of calls in one job, and
 * the forge's secondary rate limit ended the run with an unhandled
 * `Command failed` — a required check that read as a code defect, on
 * every open pull request at once, over nothing that was wrong with any
 * of them.
 *
 * The answer was never the forge's to give. Containment is a fact about
 * commits, and `merge-base --is-ancestor` states it locally with no
 * network at all. `undefined` means this clone cannot tell — a shallow
 * checkout, a ref never fetched — and only then is the forge asked.
 */
export const containedInGit = (
	baseSha: string,
	headSha: string,
	run: (args: readonly string[]) => void = (args) => {
		execFileSync('git', [...args], { stdio: 'ignore' });
	},
): boolean | undefined => {
	for (const sha of [baseSha, headSha]) {
		try {
			run(['cat-file', '-e', `${sha}^{commit}`]);
		} catch {
			// Not in this clone; the forge is the only one who knows.
			return undefined;
		}
	}
	try {
		run(['merge-base', '--is-ancestor', headSha, baseSha]);
		return true;
	} catch (error) {
		// Exit 1 is git's answer "no"; anything else is git failing to
		// answer, which must not be read as "no".
		return (error as { readonly status?: number }).status === 1
			? false
			: undefined;
	}
};

/**
 * Containment, preferring the answer that costs nothing.
 *
 * Kept separate from both sources so a test can drive every combination —
 * git says yes, git says no, git cannot tell and the forge answers, git
 * cannot tell and the forge fails — without a repository or a network.
 */
export const containsWith = (
	baseSha: string,
	headSha: string,
	deps: {
		readonly inGit: (base: string, head: string) => boolean | undefined;
		readonly viaForge: (base: string, head: string) => boolean;
	},
): boolean => {
	const local = deps.inGit(baseSha, headSha);
	if (local !== undefined) return local;
	try {
		return deps.viaForge(baseSha, headSha);
	} catch (error) {
		// A gate that cannot check must say which ref it could not check.
		// Crashing here reported a code defect for a rate limit.
		throw new Error(
			`ref-lifecycle: could not tell whether ${baseSha.slice(0, 9)} contains ${headSha.slice(0, 9)} — neither this clone nor the forge answered (${error instanceof Error ? error.message.split('\n')[0] : String(error)}).`,
		);
	}
};

const main = (): void => {
	const branches = declaredBranches(repoRoot());
	const observed = (
		gh(`repos/${REPOSITORY_SLUG}/branches?per_page=100`) as readonly {
			readonly name: string;
			readonly commit: { readonly sha: string };
		}[]
	).map((branch) => ({ name: branch.name, sha: branch.commit.sha }));
	// A work branch ends when it is published. Find, for each one, the
	// publication ref or integration branch that already contains its tip;
	// reconcile then reports it as reapable and fails the gate until the
	// copy is gone.
	const workPrefix = shortRef(branches.workRefPrefix);
	const publicationPrefix = shortRef(branches.publicationRefPrefix);
	const containers = observed.filter(
		(branch) =>
			branch.name === branches.integration ||
			(publicationPrefix !== '' &&
				branch.name.startsWith(publicationPrefix)),
	);
	const contains = (baseSha: string, headSha: string): boolean =>
		containsWith(baseSha, headSha, {
			inGit: containedInGit,
			viaForge: (base, head) => {
				const status = ghScalar(
					`repos/${REPOSITORY_SLUG}/compare/${base}...${head}`,
					'.status',
				);
				return status === 'behind' || status === 'identical';
			},
		});
	const refs = observed.map((branch) => {
		if (workPrefix === '' || !branch.name.startsWith(workPrefix)) {
			return { name: branch.name };
		}
		const publishedIn = publishedInFor(branch, containers, contains);
		return publishedIn === undefined
			? { name: branch.name }
			: { name: branch.name, publishedIn };
	});
	const pullRequests = (
		gh(
			`repos/${REPOSITORY_SLUG}/pulls?state=all&per_page=100`,
		) as readonly {
			readonly number: number;
			readonly state: string;
			readonly merged_at: string | null;
			readonly head: { readonly ref: string };
		}[]
	).map((request) => ({
		number: request.number,
		headRefName: request.head.ref,
		state: pullRequestState(request),
	}));

	// Two passes on purpose. The first costs nothing and tells us which
	// refs are worth asking the forge about; the second is the verdict,
	// with an age attached to exactly those.
	const shaOf = new Map(observed.map((b) => [b.name, b.sha]));
	const suspect = new Set(
		reconcileRefs(refs, pullRequests, branches)
			.needsAttention.filter((v) => v.role === 'publication-unclaimed')
			.map((v) => v.name),
	);
	const dated = refs.map((ref) => {
		const sha = shaOf.get(ref.name);
		if (!suspect.has(ref.name) || sha === undefined) return ref;
		const date = ghScalar(
			`repos/${REPOSITORY_SLUG}/commits/${sha}`,
			'.commit.committer.date',
		);
		const seconds = Math.floor(Date.parse(date) / 1000);
		return Number.isNaN(seconds) ? ref : { ...ref, updatedAt: seconds };
	});
	const result = reconcileRefs(dated, pullRequests, branches);

	for (const verdict of result.active) {
		console.log(`ref-lifecycle: ${verdict.name} — ${verdict.reason}`);
	}

	for (const verdict of result.awaiting) {
		console.log(`ref-lifecycle: ${verdict.name} — ${verdict.reason}`);
	}

	const deleted = new Set<string>();
	for (const verdict of result.reapable) {
		const evidence =
			verdict.pullRequest === undefined
				? verdict.reason
				: `#${verdict.pullRequest} ${verdict.reason}`;
		if (!REAP) {
			console.log(
				`ref-lifecycle: ${verdict.name} is reapable (${evidence}) — run with --reap to delete it.`,
			);
			continue;
		}
		execFileSync('gh', [
			'api',
			'-X',
			'DELETE',
			`repos/${REPOSITORY_SLUG}/git/refs/heads/${verdict.name}`,
		]);
		deleted.add(verdict.name);
		console.log(`ref-lifecycle: deleted ${verdict.name} (${evidence}).`);
	}

	// A ref this pass just reaped is resolved, not outstanding: reporting it
	// as needing attention — and exiting 1 — right after deleting it told
	// the operator the opposite of what happened.
	const outstanding = result.needsAttention.filter(
		(verdict) => !deleted.has(verdict.name),
	);
	if (outstanding.length === 0) {
		console.log(
			`ref-lifecycle: ${result.verdicts.length - deleted.size} ref(s); every one of them belongs to somebody ✓`,
		);
		return;
	}

	for (const verdict of outstanding) {
		console.error(`ref-lifecycle: ${verdict.name} — ${verdict.reason}`);
	}
	const reapableLeft = outstanding.some((verdict) =>
		result.reapable.some((reapable) => reapable.name === verdict.name),
	);
	console.error(
		reapableLeft
			? '\nRun with --reap to delete the refs reported as reapable above: their content is already published, so nothing is lost.'
			: `\nNothing was deleted: a ref with no finished pull request may be the only copy of work somebody is holding. Open a pull request for it from \`${branches.publicationRefPrefix}…\`, or delete it deliberately once you have checked it carries nothing.`,
	);
	process.exit(1);
};

if (import.meta.main) {
	main();
}
