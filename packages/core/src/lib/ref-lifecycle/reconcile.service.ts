/**
 * classify.ts — what every branch in a repository is FOR, decided from
 * the policy rather than from a habit.
 *
 * WHY this exists: the shared-checkout model asks agents to own work
 * instead of branches, and asking is not a mechanism. The failure it
 * prevents is cumulative and quiet — one abandoned branch is untidy,
 * twenty is a repository nobody can read, and each one arrives looking
 * reasonable at the time. Nothing here depends on an agent remembering
 * the rule; the repository is observed and each ref gets a verdict.
 *
 * WHY a publication ref is a category of its own: a forge needs a
 * `refs/heads/*` to build a pull request from, so the ref has to exist.
 * What must not follow is that it becomes somewhere to develop. Giving
 * it a namespace turns "is this a workspace or an artifact?" from a
 * judgement into a lookup.
 *
 * WHY reaping is split from reporting: a ref whose pull request merged
 * has provably delivered its content, and deleting it loses nothing. A
 * ref with NO pull request may be the only copy of work somebody is
 * still holding. Both are wrong states; only the first is safe to fix
 * automatically, and conflating them is how a cleanup eats work.
 *
 * WHY `foreign` is explicit: dependabot's branches are not delendai's to
 * reap. A cleanup that cannot tell "not mine" from "abandoned" is a
 * cleanup nobody can safely enable, so unowned prefixes are named in the
 * policy and reported without ever being touched.
 */

import type { IPolicyBranches } from '../contracts/interfaces/development-policy.interface';

import type {
	IObservedPullRequest,
	IObservedRef,
	IRefReconciliation,
	IRefVerdict,
	IRefRole,
} from './reconcile.interface';

export type {
	IObservedPullRequest,
	IObservedRef,
	IRefReconciliation,
	IRefVerdict,
	IRefRole,
} from './reconcile.interface';
export { REF_ROLES } from './reconcile.interface';

/** Latest pull request per head ref: an open one always wins. */
const byHeadRef = (
	pullRequests: readonly IObservedPullRequest[],
): ReadonlyMap<string, IObservedPullRequest> => {
	const index = new Map<string, IObservedPullRequest>();
	for (const request of pullRequests) {
		const existing = index.get(request.headRefName);
		// An open request outranks a finished one, and a later number
		// outranks an earlier one: the ref is doing the newest job asked
		// of it, not the first.
		if (
			existing === undefined ||
			(existing.state !== 'open' && request.state === 'open') ||
			(existing.state === request.state &&
				request.number > existing.number)
		) {
			index.set(request.headRefName, request);
		}
	}
	return index;
};

const roleOf = (
	name: string,
	branches: IPolicyBranches,
	request: IObservedPullRequest | undefined,
): { readonly role: IRefRole; readonly reason: string } => {
	if (name === branches.integration || name === branches.release) {
		return {
			role: 'protected',
			reason: 'the branch the workspace is built on',
		};
	}
	if (branches.foreignRefPrefixes.some((prefix) => name.startsWith(prefix))) {
		return {
			role: 'foreign',
			reason: 'created by automation delendai does not own — reported, never reaped',
		};
	}
	if (
		branches.publicationRefPrefix !== '' &&
		name.startsWith(branches.publicationRefPrefix)
	) {
		if (request === undefined) {
			return {
				role: 'publication-unclaimed',
				reason: 'a publication ref with no pull request: it carries work nothing is reviewing, and nothing will clean it up',
			};
		}
		return request.state === 'open'
			? { role: 'publication-open', reason: 'carrying an open pull request' }
			: {
					role: 'publication-spent',
					reason: `its pull request is ${request.state}, so the ref has delivered whatever it was going to`,
				};
	}
	return {
		role: 'unmanaged',
		reason: `outside every namespace the policy knows: under a shared checkout an agent owns work, not a branch. Work belongs in a wip ref, and a ref that exists to carry a pull request belongs under \`${branches.publicationRefPrefix}\``,
	};
};

/**
 * Classify every observed ref and split the result by what may safely be
 * done about it. Pure: the caller does the observing and the deleting.
 */
export const reconcileRefs = (
	refs: readonly IObservedRef[],
	pullRequests: readonly IObservedPullRequest[],
	branches: IPolicyBranches,
): IRefReconciliation => {
	const index = byHeadRef(pullRequests);
	const verdicts: IRefVerdict[] = refs.map((ref) => {
		const request = index.get(ref.name);
		const { role, reason } = roleOf(ref.name, branches, request);
		return {
			name: ref.name,
			role,
			reason,
			...(request === undefined ? {} : { pullRequest: request.number }),
		};
	});

	return {
		verdicts,
		// Only a delivered pull request is evidence that deleting the ref
		// loses nothing.
		reapable: verdicts.filter((v) => v.role === 'publication-spent'),
		needsAttention: verdicts.filter(
			(v) =>
				v.role === 'unmanaged' || v.role === 'publication-unclaimed',
		),
	};
};
