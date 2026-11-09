/**
 * land-git.ts — `ILandGit` on a real clone: the footprint comes from the
 * planner that picks a pull request's CI sections, a trial merge from the
 * same assembly a batch is built with, and the batch itself from
 * `assembleTrain` (merge, regenerate once, push).
 */
import { execFileSync } from 'node:child_process';

import type { ITrainCandidate } from '@delendai/core/cli';

import {
	GENERATED_REFRESH_COMMANDS,
	REGENERATED_PROJECTIONS,
} from '../git/refresh-candidate-artifacts.constant';
import { footprintBetween } from './candidate-footprint';
import type { ILandConflict, ILandGit } from './land.interface';
import { assembleTrain, discardTrain, regenerateWith } from './train-assembly';

const git = (root: string, args: readonly string[]): string =>
	execFileSync('git', [...args], {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

export const createLandGit = (input: {
	readonly root: string;
	readonly remote: string;
}): ILandGit => {
	const { root, remote } = input;
	const have = (sha: string): void => {
		try {
			git(root, ['cat-file', '-e', `${sha}^{commit}`]);
		} catch {
			git(root, ['fetch', '-q', '--', remote, sha]);
		}
	};
	return {
		footprint: (pr) => {
			have(pr.testedBase);
			have(pr.headSha);
			return footprintBetween(root, pr.testedBase, pr.headSha);
		},
		landedSince: (base, tip) => {
			have(base);
			have(tip);
			return footprintBetween(root, base, tip);
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
				ref: 'land/trial',
				members: [
					{
						number: pr.number,
						headRef: pr.headRef,
						headSha: pr.headSha,
					},
				],
				derived: REGENERATED_PROJECTIONS,
				regenerate: () => true,
				linkDependencies: () => true,
				rehearsal: true,
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
				derived: REGENERATED_PROJECTIONS,
				regenerate: regenerateWith(GENERATED_REFRESH_COMMANDS),
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
			]).startsWith('chore(generated)');
			return { conflicting: [], sha, regenerated };
		},
		treeOf: (sha) => {
			have(sha);
			return git(root, ['rev-parse', `${sha}^{tree}`]);
		},
	};
};
