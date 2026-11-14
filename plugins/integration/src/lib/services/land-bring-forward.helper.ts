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
	identityFetchEnv,
	identityPushEnv,
	pushAsIdentity,
} from './land-identity-push.helper';
import {
	assembleTrain,
	discardTrain,
	runGit as git,
} from './land-train-assembly.helper';

export { identityPushEnv };

/** The tip merged into `headSha` in a scratch worktree, plain: nothing is regenerated. */
const plainMerge = (input: {
	readonly normalize?: ILandProjectPorts['normalizeBatch'];
	/** Only for the fetches: the merge is a trial, never pushed. */
	readonly identityToken?: string;
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
		...(input.identityToken === undefined
			? {}
			: { identityToken: input.identityToken }),
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
			const env = identityFetchEnv(token);
			git(root, ['fetch', '-q', '--', remote, pr.headSha], env);
			git(root, ['fetch', '-q', '--', remote, tip], env);
		} catch {
			return 'moved';
		}
		if (holdsTip(root, tip, pr.headSha)) return 'current';
		const merged = plainMerge({
			identityToken: token,
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
			// Declined: the head moved since the listing.
			return pushAsIdentity({
				cwd: merged.scratch,
				remote,
				refspec: `HEAD:refs/heads/${pr.headRef}`,
				token,
			}) === undefined
				? 'brought'
				: 'moved';
		} finally {
			discardTrain(root, merged.scratch);
		}
	};

export { plainMerge };
