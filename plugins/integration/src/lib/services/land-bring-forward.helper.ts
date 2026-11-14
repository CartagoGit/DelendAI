/**
 * land-bring-forward.helper.ts — the integrator's way to move a head
 * forward with git: the plain merge of the tip into a head the forge never
 * built (no generator runs, so no project code runs beside the token).
 *
 * Everything is built in a throwaway worktree and pushed without force: a
 * head that moved is the author's and the next pass reads it again.
 */
import type { ILandDeps } from '@delendai/core/cli';

import type { ILandProjectPorts } from '../contracts/interfaces/integration-pass.interface';

import {
	assembleTrain,
	discardTrain,
	runGit as git,
} from './land-train-assembly.helper';

/**
 * The environment that makes git authenticate as `token`, for pushes only:
 * the checkout's own credential (the workflow token, which starts no
 * workflow) is reset and replaced. It is an environment, never an argument,
 * so the token is in no command line.
 */
export const identityPushEnv = (
	token: string,
	host = 'https://github.com/',
): NodeJS.ProcessEnv => ({
	GIT_CONFIG_COUNT: '2',
	GIT_CONFIG_KEY_0: `http.${host}.extraheader`,
	GIT_CONFIG_VALUE_0: '',
	GIT_CONFIG_KEY_1: `http.${host}.extraheader`,
	GIT_CONFIG_VALUE_1: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
});

/** The tip merged into `headSha` in a scratch worktree, plain: nothing is regenerated. */
const plainMerge = (input: {
	readonly normalize?: ILandProjectPorts['normalizeBatch'];
	readonly root: string;
	readonly remote: string;
	readonly tip: string;
	readonly headRef: string;
	readonly headSha: string;
	readonly number: number;
}): { readonly scratch?: string; readonly conflicting: boolean } => {
	const built = assembleTrain({
		root: input.root,
		remote: input.remote,
		tipSha: input.tip,
		ref: input.headRef,
		members: [
			{
				number: input.number,
				headRef: input.headRef,
				headSha: input.headSha,
			},
		],
		derived: new Set(),
		...(input.normalize === undefined
			? {}
			: { normalize: input.normalize }),
		regenerate: () => true,
		linkDependencies: () => true,
		rehearsal: true,
	});
	return {
		...(built.scratch === undefined ? {} : { scratch: built.scratch }),
		conflicting:
			built.conflicting.length > 0 || built.scratch === undefined,
	};
};

/** Whether `headSha` already contains `tip`: a merge of it would push nothing. */
const holdsTip = (root: string, tip: string, headSha: string): boolean => {
	try {
		git(root, ['merge-base', '--is-ancestor', tip, headSha]);
		return true;
	} catch {
		return false;
	}
};

/** `ILandDeps.bringForward` on a real clone, pushing as the identity `token`. */
export const createBringForward =
	(input: {
		readonly root: string;
		readonly remote: string;
		readonly token: string;
		readonly normalize?: ILandProjectPorts['normalizeBatch'];
	}): NonNullable<ILandDeps['bringForward']> =>
	async (pr, tip) => {
		const { root, remote, token } = input;
		try {
			git(root, ['fetch', '-q', '--', remote, pr.headSha]);
			git(root, ['fetch', '-q', '--', remote, tip]);
		} catch {
			return 'moved';
		}
		if (holdsTip(root, tip, pr.headSha)) return 'current';
		const merged = plainMerge({
			...(input.normalize === undefined
				? {}
				: { normalize: input.normalize }),
			root,
			remote,
			tip,
			headRef: pr.headRef,
			headSha: pr.headSha,
			number: pr.number,
		});
		if (merged.scratch === undefined) return 'conflict';
		try {
			if (merged.conflicting) return 'conflict';
			git(
				merged.scratch,
				['push', '-q', remote, `HEAD:refs/heads/${pr.headRef}`],
				identityPushEnv(token),
			);
			return 'brought';
		} catch {
			// Declined: the head moved since the listing.
			return 'moved';
		} finally {
			discardTrain(root, merged.scratch);
		}
	};

export { plainMerge };
