/**
 * land-git.service.ts — `ILandGit` on a real clone. The footprint is the
 * project's own (a port), a trial merge uses the same assembly a batch is
 * built with, and the batch itself is `assembleTrain` (merge, normalize,
 * regenerate once, push). Nothing here names a project.
 */
import type {
	ILandConflict,
	ILandGit,
	ITrainCandidate,
} from '@delendai/core/cli';

import {
	BATCH_REGENERATION_SUBJECT,
	LAND_TRIAL_REF,
} from '../contracts/constants/integration-pass.constant';
import type {
	IGitExec,
	ILandProjectPorts,
} from '../contracts/interfaces/integration-pass.interface';

import {
	assembleTrain,
	discardTrain,
	runGit,
} from './land-train-assembly.helper';
import { identityFetchEnv } from './land-identity-push.helper';

export const createLandGit = (input: {
	readonly root: string;
	readonly remote: string;
	readonly ports: ILandProjectPorts;
	readonly exec?: IGitExec;
	/** The identity's token: every push and fetch of a batch is made as it. */
	readonly token: string;
}): ILandGit => {
	const { root, remote, ports, token } = input;
	const fetchEnv = identityFetchEnv(token);
	const exec = input.exec ?? runGit;
	const git: IGitExec = (cwd, args, env) => exec(cwd, args, env ?? fetchEnv);
	const normalizing = { normalize: ports.normalizeBatch };
	const have = (sha: string): void => {
		try {
			git(root, ['cat-file', '-e', `${sha}^{commit}`]);
		} catch {
			git(root, ['fetch', '-q', '--', remote, sha]);
		}
	};
	/** `read` on the tree `members` merged onto `tip` would give: same assembly as a batch, never pushed or regenerated. */
	const trialMerge = <T>(
		tip: string,
		members: readonly ITrainCandidate[],
		read: (scratch: string) => T,
	): T | undefined => {
		have(tip);
		for (const member of members) have(member.headSha);
		const built = assembleTrain({
			root,
			remote,
			tipSha: tip,
			ref: LAND_TRIAL_REF,
			members,
			derived: new Set(),
			regenerate: () => true,
			rehearsal: true,
			...normalizing,
		});
		if (built.scratch === undefined) return undefined;
		try {
			return built.conflicting.length > 0
				? undefined
				: read(built.scratch);
		} finally {
			discardTrain(root, built.scratch);
		}
	};
	return {
		footprint: (pr) => {
			have(pr.testedBase);
			have(pr.headSha);
			return ports.footprintOf(pr.testedBase, pr.headSha);
		},
		landedSince: (base, tip) => {
			have(base);
			have(tip);
			return ports.footprintOf(base, tip);
		},
		conflictOf: (pr, tip): ILandConflict => {
			have(pr.headSha);
			have(tip);
			// Cheap first: nothing both sides touched cannot conflict.
			const mine = new Set(
				git(root, [
					'diff',
					'--name-only',
					`${pr.testedBase}...${pr.headSha}`,
				]).split('\n'),
			);
			const theirs = git(root, [
				'diff',
				'--name-only',
				`${pr.testedBase}...${tip}`,
			]).split('\n');
			if (!theirs.some((file) => file !== '' && mine.has(file)))
				return 'none';
			const built = assembleTrain({
				root,
				remote,
				tipSha: tip,
				ref: LAND_TRIAL_REF,
				members: [
					{
						number: pr.number,
						headRef: pr.headRef,
						headSha: pr.headSha,
					},
				],
				derived: ports.derivedPaths,
				regenerate: () => true,
				rehearsal: true,
				...normalizing,
			});
			if (built.scratch !== undefined) discardTrain(root, built.scratch);
			if (built.conflicting.length > 0) return 'authored';
			return built.regenerated.length > 0 ? 'derived' : 'none';
		},
		buildBatch: ({
			ref,
			tip,
			members,
		}: {
			readonly ref: string;
			readonly tip: string;
			readonly members: readonly ITrainCandidate[];
		}) => {
			const built = assembleTrain({
				root,
				remote,
				tipSha: tip,
				ref,
				members,
				derived: ports.derivedPaths,
				regenerate: ports.regenerate,
				identityToken: token,
				...normalizing,
			});
			if (
				built.conflicting.length > 0 ||
				built.pushFailure !== undefined
			) {
				return {
					conflicting: built.conflicting,
					regenerated: false,
					...(built.pushFailure === undefined
						? {}
						: { failure: built.pushFailure }),
				};
			}
			const sha =
				git(root, ['ls-remote', remote, `refs/heads/${ref}`]).split(
					/\s/u,
				)[0] ?? '';
			have(sha);
			// A regeneration commit is the one after the last merge: the batch
			// differs from its members' merge when it carries one.
			const regenerated = git(root, [
				'log',
				'-1',
				'--format=%s',
				sha,
			]).startsWith(BATCH_REGENERATION_SUBJECT);
			return { conflicting: [], sha, regenerated };
		},
		treeOf: (sha) => {
			have(sha);
			return git(root, ['rev-parse', `${sha}^{tree}`]);
		},
		mergedTree: ({ tip, members }) =>
			trialMerge(tip, members, (scratch) =>
				git(scratch, ['rev-parse', 'HEAD^{tree}']),
			),
		mergedFiles: ({ tip, members }) =>
			trialMerge(
				tip,
				members,
				(scratch) =>
					new Set(
						git(scratch, ['diff', '--name-only', tip, 'HEAD'])
							.split('\n')
							.filter((file) => file !== ''),
					),
			),
	};
};
