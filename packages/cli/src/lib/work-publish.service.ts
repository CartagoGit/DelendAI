/**
 * work-publish.service.ts — a unit of work ENDS when it is published.
 *
 * WHY this exists: publishing was two operations nobody performed
 * together outside the MCP host — push the work ref to a publication
 * ref, and then stop having a work ref. Skipping the second half is what
 * leaves a namespace full of `wip/` branches that look like live work,
 * and it is exactly what happened here: two pull requests were opened
 * and both work refs stayed on the forge afterwards.
 *
 * WHY deletion is last and conditional: the work ref is the only copy of
 * the work until the publication ref carries it. So the sequence is
 * push → PROVE the remote publication ref resolves to the same commit →
 * only then delete, and any step that fails stops the sequence with the
 * work ref untouched. A publication that half happened must leave the
 * work recoverable, never tidy.
 */
import { execFileSync } from 'node:child_process';

import {
	holdWorkRef,
	type IResolvedDevelopmentPolicy,
} from '@delendai/core/public';

import {
	WORK_PUBLISH_HOLD_POLL_MS,
	WORK_PUBLISH_HOLD_WAIT_MS,
} from '../contracts/constants/work-publish.constant';

import type {
	IWorkPublishOutcome,
	IWorkPublishRequest,
	IWorkPublishStep,
} from '../contracts/interfaces/work-publish.interface';

export type {
	IWorkPublishOutcome,
	IWorkPublishRequest,
	IWorkPublishStep,
} from '../contracts/interfaces/work-publish.interface';

const git = (
	cwd: string,
	args: readonly string[],
): { readonly ok: boolean; readonly out: string } => {
	try {
		return {
			ok: true,
			out: execFileSync('git', args, {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			}).trim(),
		};
	} catch (error) {
		const stderr =
			typeof error === 'object' && error !== null && 'stderr' in error
				? String((error as { stderr?: unknown }).stderr ?? '')
				: '';
		return { ok: false, out: stderr.trim() };
	}
};

/** A ref prefix as it appears after `refs/heads/`. */
const barePrefix = (prefix: string): string =>
	prefix.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** The fully-qualified publication ref for a name, from the policy. */
export const publicationRefFor = (
	policy: IResolvedDevelopmentPolicy,
	name: string,
): string => {
	const prefix = barePrefix(policy.branches.publicationRefPrefix);
	const tail = name.startsWith(prefix) ? name : `${prefix}${name}`;
	return `refs/heads/${tail}`;
};

/**
 * The publication ref for a work ref.
 *
 * A publication is not a new thing with a new name: it is the same unit of
 * work, published. So it keeps the name it already had, and only the
 * segment that says *in progress* becomes the one that says *proposed*.
 *
 * Deriving it is the whole point. `WORK_REF_SHAPE` states the shape once;
 * anything that asks a caller to spell the publication name invites a
 * second shape, and the second shape always wins in practice, because the
 * caller is whatever agent happens to be publishing. Every `pr/` ref in
 * this repository's namespace was flat for exactly that reason.
 *
 * Returns `undefined` when the ref is not under the policy's work-ref
 * prefix — there is then no name to keep, and guessing one is the
 * behaviour this function exists to remove.
 */
export const publicationRefFromWorkRef = (
	policy: IResolvedDevelopmentPolicy,
	workRef: string,
): string | undefined => {
	const work = barePrefix(workRef.replace(/^refs\//u, ''));
	const workPrefix = barePrefix(policy.branches.workRefPrefix);
	if (workPrefix.length === 0 || !work.startsWith(workPrefix)) {
		return undefined;
	}
	const tail = work.slice(workPrefix.length);
	if (tail.length === 0) return undefined;
	return `refs/heads/${barePrefix(policy.branches.publicationRefPrefix)}${tail}`;
};

/** The worktree that has this ref checked out, if any. */
const worktreeFor = (root: string, ref: string): string | undefined => {
	const listed = git(root, ['worktree', 'list', '--porcelain']);
	if (!listed.ok) return undefined;
	const block = listed.out
		.split('\n\n')
		.find((entry) => entry.includes(`branch ${ref}`));
	return block
		?.split('\n')
		.find((line) => line.startsWith('worktree '))
		?.slice('worktree '.length);
};

/**
 * Push the work ref to its publication ref and end the work ref.
 *
 * Returns every step it took, including the ones it refused to take, so
 * a caller can tell "published and cleaned up" from "published, and the
 * work ref is still here because the proof did not hold".
 */
export const publishWorkRef = (
	request: IWorkPublishRequest,
): IWorkPublishOutcome => {
	const steps: IWorkPublishStep[] = [];
	const step = (
		name: string,
		ok: boolean,
		detail: string,
	): IWorkPublishStep => {
		const entry = { name, ok, detail };
		steps.push(entry);
		return entry;
	};
	const { root, workRef, publicationRef, remote } = request;

	const tip = git(root, ['rev-parse', '-q', '--verify', workRef]);
	if (!tip.ok || tip.out.length === 0) {
		step('resolve-work-ref', false, `${workRef} does not exist.`);
		return { published: false, workRefRemoved: false, steps, tip: null };
	}
	step('resolve-work-ref', true, `${workRef} is at ${tip.out}.`);

	// Push from the unit's own worktree when it has one. The pre-push hook
	// checks the tree it runs in, and the shared checkout's tree is not
	// what is being published: a file somebody left loose there, a
	// person's own unfinished edit, refused every agent's publication.
	// The unit's worktree holds exactly the commit being pushed.
	const pushFrom = worktreeFor(root, workRef) ?? root;
	const pushed = git(pushFrom, [
		'push',
		remote,
		`${workRef}:${publicationRef}`,
	]);
	if (!pushed.ok) {
		step(
			'push-publication-ref',
			false,
			`could not push ${workRef} to ${publicationRef} on ${remote}: ${pushed.out}`,
		);
		return {
			published: false,
			workRefRemoved: false,
			steps,
			tip: tip.out,
		};
	}
	step(
		'push-publication-ref',
		true,
		`${publicationRef} on ${remote} now carries ${tip.out}.`,
	);

	// The proof. Without it, "deleted the work ref" rests on a push whose
	// success was reported by the same command that did it.
	const remoteTip = git(root, ['ls-remote', remote, publicationRef]);
	const carried = remoteTip.ok && remoteTip.out.startsWith(tip.out);
	if (!carried) {
		step(
			'prove-publication',
			false,
			`${remote} does not report ${publicationRef} at ${tip.out}; the work ref was NOT removed.`,
		);
		return { published: true, workRefRemoved: false, steps, tip: tip.out };
	}
	step('prove-publication', true, `${remote} reports it at ${tip.out}.`);

	if (request.keepWorkRef) {
		step(
			'remove-work-ref',
			false,
			`kept: ${request.keepWorkRefBecause ?? '--keep-work-ref was passed'}.`,
		);
		return { published: true, workRefRemoved: false, steps, tip: tip.out };
	}

	// A worktree still standing on the ref would keep it alive and leave
	// the agent in a directory whose branch no longer exists.
	const worktree = worktreeFor(root, workRef);
	if (worktree !== undefined) {
		if (worktree === request.cwd) {
			step(
				'remove-worktree',
				false,
				`${worktree} is the current directory; leave it before publishing, or pass --keep-work-ref.`,
			);
			return {
				published: true,
				workRefRemoved: false,
				steps,
				tip: tip.out,
			};
		}
		// `--force` would delete a worktree with uncommitted files in it.
		// Proving that the PUBLISHED commit reached the remote proves
		// nothing about edits made after the checkpoint: an agent that
		// checkpointed and kept working would lose whatever it had not
		// checkpointed yet. So the tree is inspected first, and a dirty
		// one keeps its worktree and its ref.
		const dirty = git(root, ['-C', worktree, 'status', '--porcelain=v1']);
		if (!dirty.ok) {
			step(
				'remove-worktree',
				false,
				`could not read the state of ${worktree}; it was left alone, and so was the work ref.`,
			);
			return {
				published: true,
				workRefRemoved: false,
				steps,
				tip: tip.out,
			};
		}
		if (dirty.out.length > 0) {
			const count = dirty.out.split('\n').length;
			step(
				'remove-worktree',
				false,
				`${worktree} has ${String(count)} uncommitted change(s) made after the checkpoint; it was left alone, and so was the work ref. Checkpoint or set them aside, then publish again.`,
			);
			return {
				published: true,
				workRefRemoved: false,
				steps,
				tip: tip.out,
			};
		}
		const removed = git(root, ['worktree', 'remove', worktree]);
		step(
			'remove-worktree',
			removed.ok,
			removed.ok ? `removed ${worktree}.` : removed.out,
		);
		if (!removed.ok) {
			return {
				published: true,
				workRefRemoved: false,
				steps,
				tip: tip.out,
			};
		}
	}

	const remoteWork = git(root, ['push', remote, '--delete', workRef]);
	step(
		'remove-remote-work-ref',
		remoteWork.ok,
		remoteWork.ok
			? `deleted ${workRef} on ${remote}.`
			: `${workRef} was not on ${remote} (or could not be deleted): ${remoteWork.out}`,
	);

	const localWork = git(root, ['update-ref', '-d', workRef, tip.out]);
	step(
		'remove-work-ref',
		localWork.ok,
		localWork.ok ? `deleted ${workRef}.` : localWork.out,
	);
	return {
		published: true,
		workRefRemoved: localWork.ok,
		steps,
		tip: tip.out,
	};
};

/**
 * `publishWorkRef`, holding the work ref for the whole sequence.
 *
 * The host pushes every checked-out work ref on a cadence. A cadence push
 * that started before the publication and finished after it deleted the
 * work ref put the ref back: published work that looked unpublished, and
 * a red ref-lifecycle check on every pull request. Holding the ref makes
 * the two exclusive: the cadence push either lands first, and this
 * deletes it, or finds the ref gone and pushes nothing.
 */
export const publishWorkRefExclusively = async (
	request: IWorkPublishRequest,
	options: {
		readonly hold?: typeof holdWorkRef;
		readonly waitMs?: number;
		readonly pollMs?: number;
	} = {},
): Promise<IWorkPublishOutcome> => {
	const refused = (detail: string): IWorkPublishOutcome => ({
		published: false,
		workRefRemoved: false,
		steps: [{ name: 'hold-work-ref', ok: false, detail }],
		tip: null,
	});
	const common = git(request.root, [
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	if (!common.ok || common.out.length === 0) {
		return refused(
			`could not locate the git directory to hold ${request.workRef}: ${common.out}`,
		);
	}
	const hold = options.hold ?? holdWorkRef;
	const pollMs = options.pollMs ?? WORK_PUBLISH_HOLD_POLL_MS;
	const deadline = Date.now() + (options.waitMs ?? WORK_PUBLISH_HOLD_WAIT_MS);
	const attempt = () =>
		hold({ gitCommonDir: common.out, ref: request.workRef });
	let held = await attempt();
	while (held.kind === 'busy' && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, pollMs));
		held = await attempt();
	}
	if (held.kind === 'busy') {
		return refused(
			`${request.workRef} is held by ${held.holder}; nothing was published. Publish again once it is released.`,
		);
	}
	try {
		const outcome = publishWorkRef(request);
		return {
			...outcome,
			steps: [
				{
					name: 'hold-work-ref',
					ok: true,
					detail: `held ${request.workRef} for the whole publication.`,
				},
				...outcome.steps,
			],
		};
	} finally {
		await held.release();
	}
};
