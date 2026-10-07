/**
 * Agents' committed work reaches its work ref on the remote at the
 * cadence the development policy declares.
 *
 * An agent that works in the checkout `delendai work enter` gave it
 * commits onto a branch under the work-ref prefix. Nothing used to push
 * that branch until the work was published, so the remote showed nothing
 * while the work went on, and a session that died took its commits with
 * it. This pushes them, every `checkpoint.intervalMinutes`, when the
 * policy asks for visible work refs and an interval or continuous
 * cadence.
 *
 * It never commits for anyone. Uncommitted work stays where it is:
 * moving the ref of a branch another process has checked out would leave
 * that worktree showing its own changes reverted. And it never touches
 * the checkout the host runs in, whose dirty files may be a person's.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type { IDelendaiHostConfig } from '../contracts/interfaces/host-config.interface';
import { createGitRunner } from '../shared/git-write';

import { resolveDurabilityRemote } from './durability-remote';
import { resolveWorkRef } from './ref-name';
import type {
	IWorkCheckoutPublication,
	IWorkCheckoutPublisher,
	IWorkCheckoutPublisherOptions,
} from './work-checkout-publisher.interface';
import { holdWorkRef } from './work-ref-lock';
import { publishWorkRef } from './work-ref-publication';

/**
 * How often to publish, or `undefined` when the policy does not ask for
 * it: hidden work refs, a slice cadence, no work-ref model, or no push.
 */
export const workCheckoutCadenceMinutes = (
	policy: IResolvedDevelopmentPolicy,
): number | undefined => {
	const { strategy, intervalMinutes } = policy.checkpoint;
	if (strategy !== 'interval' && strategy !== 'continuous') return undefined;
	if (intervalMinutes <= 0) return undefined;
	if (policy.branches.workRefVisibility !== 'visible') return undefined;
	if (policy.branches.workRefPrefix.length === 0) return undefined;
	if (!policy.persistence.autoPushAfterCommit) return undefined;
	return intervalMinutes;
};

/**
 * The branches checked out in some worktree that live under `namespace`,
 * read from `git worktree list --porcelain`.
 */
export const workCheckoutRefs = (
	porcelain: string,
	namespace: string,
): readonly string[] =>
	porcelain
		.split('\n')
		.filter((line) => line.startsWith('branch '))
		.map((line) => line.slice('branch '.length).trim())
		.filter((ref) => ref.startsWith(`${namespace}/`));

const firstField = (output: string): string | undefined =>
	output.trim().split(/\s+/u)[0] || undefined;

/**
 * Publish one work ref, holding it while doing so.
 *
 * `work publish` holds the same ref while it pushes the publication and
 * deletes the work ref. Without that, this push could look before the
 * publication existed and land after the deletion, putting back a work
 * ref whose work was already proposed. Everything below is read while
 * the ref is held, so a ref a publication just ended reads as gone.
 */
const publishOne = async (
	run: IGitRunner,
	policy: IResolvedDevelopmentPolicy,
	remoteOption: string | undefined,
	remote: string,
	ref: string,
	gitCommonDir: string,
	hold: typeof holdWorkRef,
): Promise<IWorkCheckoutPublication> => {
	const held = await hold({ gitCommonDir, ref });
	if (held.kind === 'busy') {
		return {
			ref,
			outcome: 'skipped',
			reason: `held by ${held.holder}, which may be publishing it`,
		};
	}
	try {
		return await publishHeld(run, policy, remoteOption, remote, ref);
	} finally {
		await held.release();
	}
};

const publishHeld = async (
	run: IGitRunner,
	policy: IResolvedDevelopmentPolicy,
	remoteOption: string | undefined,
	remote: string,
	ref: string,
): Promise<IWorkCheckoutPublication> => {
	const tip = await run(['rev-parse', '--verify', '--quiet', ref]);
	if (!tip.ok) {
		return {
			ref,
			outcome: 'skipped',
			reason: 'the branch no longer exists',
		};
	}
	const commit = tip.output.trim();
	// A checkout entered and not yet committed to sits on the integration
	// branch's tip. Publishing that would be an empty work ref.
	const own = await run([
		'merge-base',
		'--is-ancestor',
		commit,
		`refs/heads/${policy.branches.integration}`,
	]);
	if (own.ok) {
		return { ref, outcome: 'skipped', reason: 'no commits of its own yet' };
	}
	// Work that already reached the remote under another ref (the
	// integration branch, its publication) is finished work: the work ref
	// ends when its work does, and pushing it again only brings back a
	// branch that was removed on purpose. On 2026-09-27 a work ref deleted
	// from the remote came back from here, from a checkout that still had
	// it (x00691).
	const holders = await run([
		'for-each-ref',
		'--contains',
		commit,
		'--format=%(refname)',
		'refs/remotes',
	]);
	const ownMirror = `refs/remotes/${remote}/${ref.replace(/^refs\/heads\//u, '')}`;
	const heldElsewhere = holders.ok
		? holders.output
				.split('\n')
				.map((line) => line.trim())
				.find(
					(line) =>
						line.length > 0 &&
						line !== ownMirror &&
						!line.endsWith('/HEAD'),
				)
		: undefined;
	if (heldElsewhere !== undefined) {
		return {
			ref,
			outcome: 'skipped',
			reason: `its commits are already kept by ${heldElsewhere}`,
		};
	}
	const remoteTip = await run(['ls-remote', remote, ref]);
	if (!remoteTip.ok) {
		return {
			ref,
			outcome: 'skipped',
			reason: remoteTip.reason ?? `could not inspect ${remote}`,
		};
	}
	const remoteSha = firstField(remoteTip.output);
	if (remoteSha === commit) return { ref, outcome: 'level' };
	if (remoteSha !== undefined) {
		const forward = await run([
			'merge-base',
			'--is-ancestor',
			remoteSha,
			commit,
		]);
		if (!forward.ok) {
			return {
				ref,
				outcome: 'skipped',
				reason: `${remote} holds commits on ${ref} that this checkout does not; nothing is overwritten`,
			};
		}
	}
	const pushed = await publishWorkRef(
		run,
		policy,
		remoteOption,
		ref,
		commit,
		remoteSha,
	);
	return pushed.ok
		? { ref, outcome: 'published' }
		: { ref, outcome: 'skipped', reason: pushed.reason };
};

/** One pass over every agent work checkout. */
export const publishWorkCheckouts = async (
	run: IGitRunner,
	policy: IResolvedDevelopmentPolicy,
	remoteOption?: string,
	hold: typeof holdWorkRef = holdWorkRef,
): Promise<readonly IWorkCheckoutPublication[]> => {
	if (workCheckoutCadenceMinutes(policy) === undefined) return [];
	const listed = await run(['worktree', 'list', '--porcelain']);
	if (!listed.ok) return [];
	// The prefix names no placeholder, so resolving it as a template yields
	// the qualified namespace exactly the way every work ref is qualified.
	const namespace = resolveWorkRef(policy.branches.workRefPrefix, {
		agent: '',
		proposal: '',
		slice: '',
		generation: 0,
	});
	const refs = workCheckoutRefs(listed.output, namespace);
	if (refs.length === 0) return [];
	const remote = await resolveDurabilityRemote(run, remoteOption);
	if (remote === undefined) {
		return refs.map((ref) => ({
			ref,
			outcome: 'skipped' as const,
			reason: 'no remote to publish to',
		}));
	}
	// Without the directory there is no lock to take, and pushing without
	// it is the race the lock exists to close.
	const common = await run([
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	const gitCommonDir = common.ok ? common.output.trim() : '';
	if (gitCommonDir.length === 0) {
		return refs.map((ref) => ({
			ref,
			outcome: 'skipped' as const,
			reason: 'the git directory could not be located to hold the ref',
		}));
	}
	const publications: IWorkCheckoutPublication[] = [];
	for (const ref of refs) {
		publications.push(
			await publishOne(
				run,
				policy,
				remoteOption,
				remote,
				ref,
				gitCommonDir,
				hold,
			),
		);
	}
	return publications;
};

/**
 * Publish on the declared cadence. A policy that asks for no cadence gets
 * a publisher whose timer never starts; `tick` still answers, with
 * nothing.
 */
export const startWorkCheckoutPublisher = (
	options: IWorkCheckoutPublisherOptions,
): IWorkCheckoutPublisher => {
	let inFlight: Promise<readonly IWorkCheckoutPublication[]> | undefined;
	const tick = (): Promise<readonly IWorkCheckoutPublication[]> => {
		if (inFlight !== undefined) return inFlight;
		inFlight = (options.standDown?.() ?? Promise.resolve(undefined))
			.then((reason) =>
				reason === undefined
					? publishWorkCheckouts(
							options.run,
							options.policy,
							options.remote,
						)
					: [
							{
								ref: '*',
								outcome: 'skipped' as const,
								reason: `${reason} It pushes no work ref until it is restarted.`,
							},
						],
			)
			.then((publications) => {
				const moved = publications.filter(
					(each) => each.outcome !== 'level',
				);
				if (moved.length > 0) options.report?.(moved);
				return publications;
			})
			.finally(() => {
				inFlight = undefined;
			});
		return inFlight;
	};
	const minutes = workCheckoutCadenceMinutes(options.policy);
	const timer =
		minutes === undefined
			? undefined
			: setInterval(() => {
					void tick();
				}, minutes * 60_000);
	timer?.unref?.();
	return {
		tick,
		stop: () => {
			if (timer !== undefined) clearInterval(timer);
		},
	};
};

/**
 * A report writer that writes a pass's report only when it differs from
 * the last one. The publisher runs every few minutes, and four empty units
 * of a stopped swarm put the same "no commits of its own yet" line into
 * the server's log every five minutes for a day.
 */
export const changedReports = (
	write: (line: string) => void,
): ((moved: unknown) => void) => {
	let last = '';
	return (moved) => {
		const line = JSON.stringify({
			event: 'work-checkouts.published',
			moved,
		});
		if (line === last) return;
		last = line;
		write(line);
	};
};

/**
 * The publisher a server runs, from its host config: none without a
 * development policy. Reports go to stderr; stdout is the MCP transport.
 */
export const startServerWorkCheckoutPublisher = (
	config: Pick<
		IDelendaiHostConfig,
		'developmentPolicy' | 'runtimeBehindCheckout' | 'workspace'
	>,
): IWorkCheckoutPublisher | undefined =>
	config.developmentPolicy === undefined
		? undefined
		: startWorkCheckoutPublisher({
				run: createGitRunner(config.workspace.root),
				policy: config.developmentPolicy,
				...(config.runtimeBehindCheckout === undefined
					? {}
					: { standDown: config.runtimeBehindCheckout }),
				report: changedReports((line) => {
					process.stderr.write(`${line}\n`);
				}),
			});
