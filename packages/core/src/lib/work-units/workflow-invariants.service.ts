/**
 * workflow-invariants.service.ts — the workflow checks itself.
 *
 * Every promise the work-ref model makes was, until now, verified by a
 * person looking at a Git graph and noticing something wrong. That is
 * the slowest possible detector and the least reliable one: it found a
 * staged `AGENT-BOOTSTRAP.md` three separate times, each time hours
 * after it appeared, and each time the diagnosis started from scratch.
 *
 * So the promises are written down here as checks, in one place, with
 * the remedy attached to each. `delendai work doctor` answers in one
 * screen whether the model is actually holding, and if not, which
 * promise broke and what fixes it.
 *
 * ## Why this lives in the product and not in this repository's tooling
 *
 * It used to be `tools/scripts/git/check-workflow-invariants.script.ts`,
 * reachable only as `bun run work:doctor` from a clone of delendai
 * itself. Every OTHER project — the ones the work-ref model is actually
 * for — had the model and no way to ask whether it was holding. A
 * detector that ships with the thing it detects is dogfooding; one that
 * stays behind in the toolbox is a private diagnostic.
 *
 * It is READ-ONLY. It never repairs anything: a checker that also
 * repairs cannot be run to find out whether repair was needed.
 */
import { execFileSync } from 'node:child_process';

import { HOOK_GIT_ENVIRONMENT } from '../contracts/constants/hook-git-environment.constant';

import { workRefTailSegments } from '../development-policy/work-ref-placeholders';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import type {
	IInvariantReport,
	IInvariantResult,
	IInvariantScope,
} from '../contracts/interfaces/workflow-invariants.interface';

export type {
	IInvariantReport,
	IInvariantResult,
	IInvariantScope,
} from '../contracts/interfaces/workflow-invariants.interface';

/**
 * The environment without what git sets for a hook. Run from a hook in a
 * linked worktree, `GIT_DIR` and `GIT_INDEX_FILE` point at THAT worktree,
 * so every question asked of the shared checkout was answered by the
 * worktree: a unit mid-merge was reported as the shared checkout, off
 * the integration branch and full of changes.
 */
const outsideAHook = (): NodeJS.ProcessEnv => {
	const env = { ...process.env };
	for (const key of HOOK_GIT_ENVIRONMENT) delete env[key];
	return env;
};

const git = (root: string, args: readonly string[]): string => {
	try {
		return execFileSync('git', [...args], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: outsideAHook(),
		}).trim();
	} catch {
		return '';
	}
};

const lines = (out: string): readonly string[] =>
	out
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

/** The namespace prefix as it appears in a ref name, without `refs/`. */
const bare = (prefix: string): string =>
	prefix.replace(/^refs\//u, '').replace(/^heads\//u, '');

/**
 * Every invariant, as a question asked of the repository.
 *
 * Order is deliberate: the cheapest and most local first, so the first
 * failure in the list is usually the one to fix first.
 */
export const checkWorkflowInvariants = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote?: string;
	/** Judge only these scopes. Default: all of them. */
	readonly scopes?: readonly IInvariantScope[];
}): IInvariantReport => {
	const { root, policy } = input;
	const remote = input.remote ?? 'origin';
	const integration = policy.branches.integration;
	const workPrefix = bare(policy.branches.workRefPrefix);
	const pubPrefix = bare(policy.branches.publicationRefPrefix);
	const results: IInvariantResult[] = [];

	const wanted = input.scopes;
	const add = (result: IInvariantResult): void => {
		if (wanted !== undefined && !wanted.includes(result.scope)) return;
		results.push(result);
	};

	// 1. The shared checkout carries nothing.
	const dirty = lines(git(root, ['status', '--porcelain=v1']));
	add({
		scope: 'checkout',
		id: 'checkout-clean',
		claim: 'the shared checkout carries no modifications',
		holds: dirty.length === 0,
		observed:
			dirty.length === 0
				? 'clean'
				: `${String(dirty.length)} path(s): ${dirty.slice(0, 5).join(', ')}`,
		remedy: 'git restore --staged --worktree -- <path>',
	});

	// 2. And it never left the integration node.
	const head = git(root, ['symbolic-ref', '--short', 'HEAD']);
	add({
		scope: 'checkout',
		id: 'checkout-anchored',
		claim: `the shared checkout is on \`${integration}\``,
		holds:
			!policy.workspace.anchoredToIntegrationBranch ||
			head === integration,
		observed: head === '' ? 'detached' : head,
		remedy: `git switch ${integration}`,
	});

	// 3. A work ref is alive only while a worktree stands on it.
	//
	// The distinction matters more than it looks. A check that called
	// every local work ref a violation would be red for the whole time
	// an agent is working, which is most of the time — and a check that
	// is usually red is a check nobody reads. What is actually wrong is
	// a work ref with nothing working on it: publishing ends a work ref,
	// so one that outlived its worktree either never published or was
	// abandoned.
	const worktreeBranches = new Set(
		lines(git(root, ['worktree', 'list', '--porcelain']))
			.filter((line) => line.startsWith('branch '))
			.map((line) =>
				line.slice('branch '.length).replace('refs/heads/', ''),
			),
	);
	const localWork = lines(
		git(root, [
			'for-each-ref',
			'--format=%(refname:short)',
			`refs/heads/${workPrefix}**`,
		]),
	);
	const abandoned = localWork.filter((ref) => !worktreeBranches.has(ref));
	add({
		scope: 'checkout',
		id: 'no-abandoned-work-refs',
		claim: 'every local work ref has a worktree working on it',
		holds: abandoned.length === 0,
		observed:
			localWork.length === 0
				? 'no work refs'
				: abandoned.length === 0
					? `${String(localWork.length)} live, none abandoned`
					: `${String(abandoned.length)}: ${abandoned.slice(0, 3).join(', ')}`,
		remedy: 'publish it, or delete it once its content is proven elsewhere',
	});

	// 4. Every published ref is shaped like the work it published.
	// Listed whole and filtered here: a `*` in an `ls-remote` pattern does
	// not cross a path component, so `pr/*` silently matched only the flat
	// names — the exact shape this check exists to catch.
	const heads = lines(git(root, ['ls-remote', '--heads', remote])).map(
		(line) => line.split('\t')[1]?.replace('refs/heads/', '') ?? '',
	);
	const published = heads.filter((ref) => ref.startsWith(pubPrefix));
	// The shape is the policy's own work-ref template, which the
	// publication ref repeats under its prefix: the count of components
	// is read from it, so a component added to the template (as `kind`
	// was) cannot leave this check judging the old shape.
	const expectedSegments = workRefTailSegments(
		policy.branches.workRefTemplate,
	);
	const misshapen =
		expectedSegments === 0
			? []
			: published.filter((ref) => {
					const tail = ref.slice(pubPrefix.length);
					return tail.split('/').length !== expectedSegments;
				});
	add({
		scope: 'forge',
		id: 'publications-canonical',
		claim: 'every publication ref carries agent, slice and generation',
		holds: misshapen.length === 0,
		observed:
			published.length === 0
				? 'no publication refs'
				: misshapen.length === 0
					? `${String(published.length)} ref(s), all canonical`
					: `${String(misshapen.length)} flat: ${misshapen.slice(0, 3).join(', ')}`,
		remedy: `give ${pubPrefix}<name> the agent, slice and generation segments (or delete the flat ref), then publish the unit again with \`delendai work publish\``,
	});

	// 5. Every candidate contains the integration branch.
	const behind = published
		.map((ref) => ({
			ref,
			count: Number(
				git(root, [
					'rev-list',
					'--count',
					`${remote}/${ref}..${remote}/${integration}`,
				]) || '0',
			),
		}))
		.filter((each) => each.count > 0);
	add({
		scope: 'forge',
		id: 'candidates-hydrated',
		claim: `every candidate contains \`${integration}\``,
		holds: behind.length === 0,
		observed:
			published.length === 0
				? 'no candidates'
				: behind.length === 0
					? `${String(published.length)} candidate(s), none behind`
					: behind
							.map((e) => `${e.ref} behind ${String(e.count)}`)
							.slice(0, 3)
							.join(', '),
		remedy: 'bun run forge:refresh -- --apply',
	});

	// 6. No worktree outlived the work ref it was made for.
	//
	// The mirror of the check above: a worktree standing on a live work
	// ref is an agent working, which is the model behaving. A worktree
	// standing on the integration branch, or on a ref that no longer
	// exists, is a leftover — and leftovers are what made the pinned
	// checkout dirty and the counts flicker.
	const worktreePaths = lines(git(root, ['worktree', 'list', '--porcelain']))
		.filter((line) => line.startsWith('worktree '))
		.map((line) => line.slice('worktree '.length))
		.filter((path) => path !== root);
	const leftover = worktreePaths.filter((path) => {
		const branch = git(path, ['symbolic-ref', '--short', 'HEAD']);
		return branch === '' || !branch.startsWith(workPrefix);
	});
	add({
		scope: 'checkout',
		id: 'no-leftover-worktrees',
		claim: 'every worktree stands on a work ref',
		holds: leftover.length === 0,
		observed:
			worktreePaths.length === 0
				? 'none'
				: leftover.length === 0
					? `${String(worktreePaths.length)} working`
					: `${String(leftover.length)}: ${leftover.slice(0, 3).join(', ')}`,
		remedy: 'git worktree remove --force <path>',
	});

	// 7. No work ref is still on the forge once nothing works on it:
	// publishing ends it. A live unit's ref IS on the forge, on purpose —
	// the server pushes it so a lost machine loses no work — and calling
	// that broken told every agent to delete a colleague's backup.
	const remoteWork = heads.filter(
		(ref) => ref.startsWith(workPrefix) && !worktreeBranches.has(ref),
	);
	add({
		scope: 'forge',
		id: 'no-remote-work-refs',
		claim: 'no work ref outlived its unit on the forge',
		holds: remoteWork.length === 0,
		observed:
			remoteWork.length === 0
				? 'none'
				: `${String(remoteWork.length)} ref(s)`,
		remedy: 'publish the unit (`delendai work publish`); delete the ref only once its commits are on the integration branch or a publication',
	});

	// 8. A publication still on the forge holds something the integration
	// branch lacks. One that holds nothing has landed, or never carried
	// work: either way it is a branch that looks like a pull request to
	// come and is not.
	const spent = published.filter(
		(ref) =>
			git(root, [
				'rev-list',
				'--count',
				`${remote}/${integration}..${remote}/${ref}`,
			]) === '0',
	);
	add({
		scope: 'forge',
		id: 'publications-hold-work',
		claim: `every publication holds work \`${integration}\` lacks`,
		holds: spent.length === 0,
		observed:
			published.length === 0
				? 'no publication refs'
				: spent.length === 0
					? `${String(published.length)} ref(s), all holding work`
					: `${String(spent.length)} spent: ${spent.slice(0, 3).join(', ')}`,
		remedy: `git push ${remote} --delete <ref> — its commits are already on \`${integration}\``,
	});

	// 9. The local integration branch only follows the forge's. A commit
	// it holds that the forge lacks was made in the shared checkout: it
	// is in no pull request, every unit entered here starts from it, and
	// the next fast-forward refuses.
	const ahead = lines(
		git(root, [
			'rev-list',
			`${remote}/${integration}..refs/heads/${integration}`,
		]),
	);
	add({
		scope: 'checkout',
		id: 'integration-follows-forge',
		claim: `the local \`${integration}\` holds nothing the forge's lacks`,
		holds: !policy.integration.requiresPullRequest || ahead.length === 0,
		observed:
			ahead.length === 0
				? 'level, or behind'
				: `${String(ahead.length)} commit(s) only here`,
		remedy: `carry what is worth keeping into a unit (\`delendai work enter\`, then cherry-pick), then \`git reset --hard ${remote}/${integration}\` in the shared checkout`,
	});

	return { results, broken: results.filter((r) => !r.holds).length };
};

/** One line per invariant — the whole model, on one screen. */
export const renderInvariantReport = (report: IInvariantReport): string => {
	const body = report.results.map(
		(r) =>
			`${r.holds ? '✓' : '✗'} ${r.id.padEnd(24)} ${r.claim}\n` +
			`  ${r.holds ? '' : 'BROKEN — '}${r.observed}` +
			(r.holds || r.remedy === undefined ? '' : `\n  fix: ${r.remedy}`),
	);
	return [
		...body,
		'',
		report.broken === 0
			? `workflow-invariants: all ${String(report.results.length)} hold.`
			: `workflow-invariants: ${String(report.broken)} of ${String(report.results.length)} BROKEN.`,
	].join('\n');
};
