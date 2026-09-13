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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPOSITORY_SLUG } from '@delendai/core/lib/contracts/constants/repository-identity.constant';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	reconcileRefs,
	type IObservedPullRequest,
} from '@delendai/core/lib/ref-lifecycle/reconcile.service';

// `monorepo-paths` rather than a hardcoded path: the layout convention
// is that every consumer of these paths imports the path module. This
// guard needs `node_modules` regardless — it resolves the policy through
// core — so the import-lean constraint that applies to
// `branch-protection-guard` does not apply here.
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

const policyBranches = () => {
	const config = JSON.parse(
		readFileSync(join(repoRoot(), 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
	return resolveDevelopmentPolicy({
		...(config.development === undefined
			? {}
			: { development: config.development }),
	}).branches;
};

const pullRequestState = (request: {
	readonly state: string;
	readonly merged_at: string | null;
}): IObservedPullRequest['state'] => {
	if (request.state === 'open') return 'open';
	return request.merged_at === null ? 'closed' : 'merged';
};

const main = (): void => {
	const branches = policyBranches();
	const observed = (
		gh(`repos/${REPOSITORY_SLUG}/branches?per_page=100`) as readonly {
			readonly name: string;
			readonly commit: { readonly sha: string };
		}[]
	).map((branch) => ({ name: branch.name, sha: branch.commit.sha }));
	const refs = observed.map((branch) => ({ name: branch.name }));
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

	for (const verdict of result.awaiting) {
		console.log(`ref-lifecycle: ${verdict.name} — ${verdict.reason}`);
	}

	for (const verdict of result.reapable) {
		if (!REAP) {
			console.log(
				`ref-lifecycle: ${verdict.name} is reapable (#${verdict.pullRequest ?? '?'} ${verdict.reason}) — run with --reap to delete it.`,
			);
			continue;
		}
		execFileSync('gh', [
			'api',
			'-X',
			'DELETE',
			`repos/${REPOSITORY_SLUG}/git/refs/heads/${verdict.name}`,
		]);
		console.log(
			`ref-lifecycle: deleted ${verdict.name} (#${verdict.pullRequest ?? '?'}).`,
		);
	}

	if (result.needsAttention.length === 0) {
		console.log(
			`ref-lifecycle: ${result.verdicts.length} ref(s); every one of them belongs to somebody ✓`,
		);
		return;
	}

	for (const verdict of result.needsAttention) {
		console.error(`ref-lifecycle: ${verdict.name} — ${verdict.reason}`);
	}
	console.error(
		`\nNothing was deleted: a ref with no finished pull request may be the only copy of work somebody is holding. Open a pull request for it from \`${branches.publicationRefPrefix}…\`, or delete it deliberately once you have checked it carries nothing.`,
	);
	process.exit(1);
};

main();
