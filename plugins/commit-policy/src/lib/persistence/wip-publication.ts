/**
 * wip-publication.ts — making a work ref durable on the remote.
 *
 * Split from the persistence port, which decides WHETHER to publish; this
 * module only knows HOW, and what can go wrong on the way.
 */
import type {
	IGitRunner,
	IResolvedDevelopmentPolicy,
} from '@delendai/core/public';

import { DURABILITY_REMOTE_MISSING } from '../contracts/constants/durability-remote.constant';
import { resolveDurabilityRemote } from './durability-remote.service';

/** Whether the local work ref exists and points at `commit`. */
export const localRefHolds = async (
	run: IGitRunner,
	ref: string,
	commit: string,
): Promise<boolean> => {
	const qualified = ref.startsWith('refs/') ? ref : `refs/heads/${ref}`;
	const resolved = await run(['rev-parse', '--verify', '--quiet', qualified]);
	return resolved.ok && resolved.output.trim() === commit;
};

export const publishWorkRef = async (
	run: IGitRunner,
	policy: IResolvedDevelopmentPolicy,
	remoteOption: string | undefined,
	ref: string,
	commit: string,
	expectedOld: string | undefined,
): Promise<
	{ readonly ok: true } | { readonly ok: false; readonly reason: string }
> => {
	if (!policy.persistence.autoPushAfterCommit) return { ok: true };
	const remote = await resolveDurabilityRemote(run, remoteOption);
	if (remote === undefined)
		return { ok: false, reason: DURABILITY_REMOTE_MISSING };
	const before = await run(['ls-remote', remote, ref]);
	if (!before.ok)
		return {
			ok: false,
			reason: before.reason ?? `could not inspect ${remote}/${ref}`,
		};
	const remoteSha = before.output.trim().split(/\s+/u)[0] || undefined;
	if (remoteSha === commit) return { ok: true };
	if (remoteSha !== undefined && remoteSha !== expectedOld)
		return {
			ok: false,
			reason: `remote work ref moved concurrently: expected ${expectedOld ?? 'absence'}, found ${remoteSha}`,
		};
	// Push the immutable object id rather than trusting the local ref to
	// survive a concurrent hydration fetch. The reconciler mirrors and
	// prunes refs/wip/*; an unpublished local name can therefore disappear
	// between checkpoint creation and this network operation.
	const pushed = await run([
		'push',
		'--porcelain',
		`--force-with-lease=${ref}:${remoteSha ?? ''}`,
		remote,
		`${commit}:${ref}`,
	]);
	if (!pushed.ok)
		return {
			ok: false,
			reason: pushed.reason ?? `could not push ${ref} to ${remote}`,
		};
	const observed = await run(['ls-remote', '--exit-code', remote, ref]);
	const observedSha = observed.ok
		? observed.output.trim().split(/\s+/u)[0]
		: undefined;
	return observedSha === commit
		? { ok: true }
		: {
				ok: false,
				reason: `remote ${remote} did not confirm ${ref} at ${commit}`,
			};
};
