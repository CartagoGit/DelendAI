/**
 * verify-checkout.ts — phase 9: is the visible working tree still where
 * the policy says it must be?
 *
 * Under a `shared-checkout` policy nobody may move HEAD: every agent
 * writes through WIP refs precisely so the one tree the human is looking
 * at stays on the integration branch. If HEAD has been moved — onto a
 * work ref, onto a feature branch, or into a detached state — then the
 * assumptions every other subsystem makes about the tree are false.
 *
 * WHY this is reported and never repaired: the obvious "fix" is
 * `git switch develop` or `git reset --hard`, and both can destroy
 * uncommitted work that exists nowhere else — including the work of
 * whoever moved HEAD in the first place. The git seam this subsystem is
 * given has no checkout and no reset method at all, so the temptation is
 * not merely resisted, it is unavailable.
 */

import type { IResolvedDevelopmentPolicy } from '../../contracts/interfaces/development-policy.interface';
import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import type {
	IObservedRef,
	IStartupGitSeam,
	IWorktreeDirtiness,
} from '../seams.interface';

import type { ICheckoutPhaseResult } from './verify-checkout.interface';

export type { ICheckoutPhaseResult } from './verify-checkout.interface';

/**
 * Being ON the integration branch is not the same as being AT it. A
 * checkout that stayed behind while the branch advanced still looks
 * correct to every other check, and publishing from it reverts whatever
 * landed in between: observed here as a candidate carrying a five-commit-old
 * `validate.ts` that would have removed a rule merged in the meantime.
 *
 * Reported as a NOTE, never a blocker. Falling behind is the normal
 * consequence of somebody else merging, so failing startup on it would
 * make the server unusable; the hard refusal belongs at publication,
 * where the stale content would actually do damage. What this owes the
 * operator is that the condition is never silent.
 *
 * An unresolvable remote ref is reported as its own note rather than
 * treated as "up to date" — absence of evidence is not evidence.
 */
const freshnessFindings = async (
	git: IStartupGitSeam,
	expected: string,
	head: string | undefined,
): Promise<readonly IStartupFinding[]> => {
	const remoteName = await remoteOf(git, expected);
	const remote = await git.resolveRef(
		`refs/remotes/${remoteName}/${expected}`,
	);
	if (remote === undefined || head === undefined)
		return [
			finding({
				code: 'checkout.freshness-unknown',
				phase: 'checkout',
				kind: 'note',
				subject: expected,
				message: `HEAD is on the integration branch ${expected}, but its remote-tracking ref could not be read, so whether the checkout is current is UNKNOWN.`,
			}),
		];

	if (remote === head)
		return [
			finding({
				code: 'checkout.on-integration',
				phase: 'checkout',
				kind: 'note',
				subject: expected,
				message: `HEAD is on the integration branch ${expected} and level with its remote.`,
			}),
		];

	// Three distinct conditions, three distinct codes. Folding "ahead"
	// into "diverged" would name an unpushed local commit as a conflict
	// and send the operator looking for a reconciliation that does not
	// exist.
	const behind = await git.isAncestor(head, remote);
	const ahead = await git.isAncestor(remote, head);

	// BEHIND is the one condition with a repair that cannot lose
	// anything, and it is also the one that happens constantly: every
	// pull request the forge absorbs leaves the shared checkout one
	// merge further back. So it is repaired here rather than described.
	if (behind) return await hydrate(git, expected, head, remote);

	const code = ahead ? 'checkout.ahead-of-integration' : 'checkout.diverged';
	const message = ahead
		? `HEAD is on ${expected} but AHEAD of its remote: commits exist here that were never pushed. Under a shared checkout nobody should be committing to ${expected} directly.`
		: `HEAD is on ${expected} and has DIVERGED from its remote: each side has commits the other does not.`;

	return [
		finding({
			code,
			phase: 'checkout',
			kind: 'note',
			subject: expected,
			message,
			detail: { expected, head, remote },
		}),
	];
};

/**
 * Advance a checkout that is merely behind, or say why it was not.
 *
 * The three outcomes are kept apart on purpose:
 *
 *   - **hydrated** — the tree was clean and git fast-forwarded it. The
 *     operator is told how far it moved, because silently changing what
 *     somebody is looking at is its own kind of surprise.
 *   - **refused, dirty** — somebody has uncommitted work in the shared
 *     tree. A fast-forward would not delete it, but it would move the
 *     ground under an edit whose author is not here to agree, so the
 *     condition is reported and the tree is left exactly as found.
 *   - **failed** — git said no. Reported verbatim rather than retried
 *     with something blunter: the reason git refuses a fast-forward is
 *     always that it would not have been one.
 */
/**
 * The tree's state, from a seam that may not implement the tri-state
 * answer yet. An absent `dirtyState` is treated as unknown-safe: the
 * paths are still read, but a failure there cannot masquerade as clean.
 */
/**
 * Which remote to judge currency against. Hard-coding `origin` while the
 * fetch picked the first remote it found is how a project whose remote
 * is `upstream` fetched from one repository and compared itself to
 * another (x00558 S3).
 */
const remoteOf = async (
	git: IStartupGitSeam,
	integrationBranch: string,
): Promise<string> =>
	(git.integrationRemote === undefined
		? undefined
		: await git.integrationRemote(integrationBranch)) ?? 'origin';

const dirtinessOf = async (
	git: IStartupGitSeam,
): Promise<IWorktreeDirtiness> => {
	if (git.dirtyState !== undefined) return git.dirtyState();
	const paths = await git.dirtyPaths();
	return paths.length === 0 ? { kind: 'clean' } : { kind: 'dirty', paths };
};

const hydrate = async (
	git: IStartupGitSeam,
	expected: string,
	head: string,
	remote: string,
): Promise<readonly IStartupFinding[]> => {
	// "Could not check" is not "clean". A fast-forward here is the only
	// repair this phase performs on the tree, and performing it on
	// evidence nobody gathered is the mistake — not the fast-forward,
	// which git itself would refuse, but asserting a precondition that
	// was never verified (x00558).
	const state = await dirtinessOf(git);
	if (state.kind === 'unknown') {
		return [
			finding({
				code: 'checkout.behind-integration',
				phase: 'checkout',
				kind: 'note',
				subject: expected,
				message: `HEAD is on ${expected} but BEHIND its remote, and whether the tree is clean could NOT be determined (${state.reason}), so it was left alone. Nothing was advanced on an unchecked precondition.`,
				detail: { expected, head, remote },
			}),
		];
	}
	if (state.kind === 'dirty') {
		return [
			finding({
				code: 'checkout.behind-integration',
				phase: 'checkout',
				kind: 'note',
				subject: expected,
				message: `HEAD is on ${expected} but BEHIND its remote, and the tree has ${String(state.paths.length)} uncommitted change(s), so it was left alone. Publishing from here would revert whatever landed in between: commit or set aside the changes, then boot again to advance it.`,
				detail: {
					expected,
					head,
					remote,
					dirty: state.paths.length,
				},
			}),
		];
	}

	const advanced = await git.fastForward(
		`refs/remotes/${await remoteOf(git, expected)}/${expected}`,
	);
	if (!advanced.ok) {
		return [
			finding({
				code: 'checkout.behind-integration',
				phase: 'checkout',
				kind: 'note',
				subject: expected,
				message: `HEAD is on ${expected} and BEHIND its remote, and the fast-forward did not apply: ${advanced.reason ?? 'git refused it'}. The tree is unchanged.`,
				detail: { expected, head, remote },
			}),
		];
	}

	return [
		finding({
			code: 'checkout.hydrated',
			phase: 'checkout',
			kind: 'note',
			subject: expected,
			message: `HEAD was on ${expected} but behind its remote, and the tree was clean, so it was fast-forwarded to it. Work started from this checkout now begins where the forge is.`,
			detail: { expected, from: head, to: remote },
		}),
	];
};

/**
 * Generated artifacts are never anybody's work.
 *
 * A file this repository regenerates can be rewritten by any command
 * that happens to run, and it then sits in the shared tree looking
 * exactly like an edit. Telling the two apart is what lets an operator
 * act: a generated path is safe to restore, a source path is somebody's
 * unpublished work and must not be touched by anyone but its author.
 */
const GENERATED_MARKERS: readonly string[] = [
	'.generated.',
	'docs/delendai/host-hints/',
	'/dist/',
];

const looksGenerated = (path: string): boolean =>
	GENERATED_MARKERS.some((marker) => path.includes(marker));

/**
 * A dirty shared checkout, reported and never repaired.
 *
 * Under this model the tree belongs to everyone, so an unexplained
 * change is somebody else's in-flight work until proven otherwise —
 * and the one thing that must not happen is an agent "tidying" it. The
 * finding names the paths and separates the generated ones, because
 * those are the ones an operator can safely return.
 */
const dirtinessFindings = async (
	git: IStartupGitSeam,
): Promise<readonly IStartupFinding[]> => {
	const dirty = await git.dirtyPaths();
	if (dirty.length === 0) return [];

	const generated = dirty.filter(looksGenerated);
	const authored = dirty.filter((path) => !looksGenerated(path));
	return [
		finding({
			code: 'checkout.dirty',
			phase: 'checkout',
			kind: 'note',
			subject: `${String(dirty.length)} path(s)`,
			message: `The shared checkout has ${String(dirty.length)} uncommitted path(s): ${String(generated.length)} generated, ${String(authored.length)} authored. NOTHING was reverted — an authored path is somebody's unpublished work, and the generated ones are returned by \`forge:release\`, never by tidying the tree by hand.`,
			detail: {
				generated: generated.join(', '),
				authored: authored.join(', '),
			},
		}),
	];
};

export const runCheckoutPhase = async (input: {
	readonly git: IStartupGitSeam;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly refs: readonly IObservedRef[];
}): Promise<ICheckoutPhaseResult> => {
	const expected = input.policy.branches.integration;
	const branch = await input.git.currentBranch();
	const head = await input.git.headSha();

	if (branch === expected) {
		return {
			findings: [
				...(await freshnessFindings(input.git, expected, head)),
				...(await dirtinessFindings(input.git)),
			],
		};
	}

	// A branch that exists neither here nor on the remote is not one HEAD
	// wandered away from: the policy names a branch that is gone, typically
	// merged and deleted. Saying "HEAD moved" would send an agent to find a
	// branch it cannot check out.
	const integrationExists =
		(await input.git.resolveRef(`refs/heads/${expected}`)) !== undefined ||
		(await input.git.resolveRef(
			`refs/remotes/${await remoteOf(input.git, expected)}/${expected}`,
		)) !== undefined;
	if (!integrationExists) {
		return {
			findings: [
				finding({
					code: 'checkout.integration-missing',
					phase: 'checkout',
					kind: 'blocker',
					subject: expected,
					message: `The development policy's integration branch \`${expected}\` does not exist locally or on its remote; it was probably merged and deleted. HEAD is on ${branch ?? `the detached commit ${head ?? 'unknown'}`}, and nothing was moved. Set \`development.branches.integration\` in delendai.config.json to the branch work now integrates into${branch === undefined ? '' : ` (the checkout is on \`${branch}\`)`}.`,
					detail: {
						expected,
						...(branch === undefined ? {} : { branch }),
						...(head === undefined ? {} : { head }),
					},
				}),
			],
		};
	}

	const onWorkRef =
		head === undefined
			? undefined
			: input.refs.find((ref) => ref.sha === head);

	// A worktree-per-agent policy expects other branches to exist; only
	// HEAD sitting on a managed WORK ref is always wrong there, because a
	// work ref is not a branch and must never be a checkout target.
	if (!input.policy.workspace.pinnedCheckout && onWorkRef === undefined) {
		return {
			findings: [
				finding({
					code: 'checkout.on-integration',
					phase: 'checkout',
					kind: 'note',
					subject: branch ?? head ?? 'unknown',
					message: `HEAD is on ${branch ?? 'a detached commit'}; the policy allows per-agent worktrees, so this is not a violation.`,
				}),
			],
		};
	}

	return {
		findings: [
			finding({
				code: 'checkout.head-moved',
				phase: 'checkout',
				kind: 'blocker',
				subject: onWorkRef?.name ?? branch ?? head ?? 'HEAD',
				message:
					onWorkRef === undefined
						? `HEAD is on ${branch ?? `the detached commit ${head ?? 'unknown'}`} instead of the integration branch ${expected}. It was NOT moved back: doing so could discard uncommitted work.`
						: `HEAD has been moved onto the work ref ${onWorkRef.name}, which is not a branch and must never be a checkout target. Nothing was reset.`,
				detail: {
					expected,
					...(branch === undefined ? {} : { branch }),
					...(head === undefined ? {} : { head }),
				},
			}),
		],
	};
};
