#!/usr/bin/env bun
/**
 * bring-forward.script.ts — the author's side of "needs update": every
 * pull request `land` labelled `delendai:needs-update` gets the integration
 * branch merged in (derived files regenerated once) and pushed with this
 * machine's own git credentials, so the forge builds the new head.
 *
 * `land` runs with a workflow token: a commit it pushed would start no CI,
 * and the pull request would wait for checks that never come. So land only
 * labels, and this, run by the host after each move of the integration
 * branch, does the push. A conflict in authored code stays with its author.
 * It builds in a throwaway clone and leaves no ref or worktree here.
 *
 *   bun tools/scripts/forge/bring-forward.script.ts [--apply]
 */
import { execFileSync } from 'node:child_process';

import { LAND_LABEL_NEEDS_UPDATE } from '@delendai/core/cli';

import { declaredBranches } from '../lib/declared-branches';
import { throwawayClone } from './land-rehearsal-clone';
import {
	GENERATED_REFRESH_COMMANDS,
	REGENERATED_PROJECTIONS,
} from './land-derived.constant';
import {
	assembleTrain,
	discardTrain,
	linkDependenciesFrom,
	regenerateWith,
} from './train-assembly';

interface ILabelledPull {
	readonly number: number;
	readonly headRefName: string;
	readonly headRefOid: string;
	readonly isCrossRepository: boolean;
}

const run = (cwd: string, command: string, args: readonly string[]): string =>
	execFileSync(command, [...args], {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

/** The pull requests to bring forward: labelled, from this repository. */
export const toBringForward = (
	pulls: readonly ILabelledPull[],
): readonly ILabelledPull[] => pulls.filter((pull) => !pull.isCrossRepository);

const main = (): number => {
	const root = process.cwd();
	const apply = process.argv.includes('--apply');
	const integration = declaredBranches(root).integration;
	const pulls = toBringForward(
		JSON.parse(
			run(root, 'gh', [
				'pr',
				'list',
				'--state',
				'open',
				'--base',
				integration,
				'--label',
				LAND_LABEL_NEEDS_UPDATE,
				'--json',
				'number,headRefName,headRefOid,isCrossRepository',
			]),
		) as ILabelledPull[],
	);
	if (pulls.length === 0) {
		console.log('bring-forward: nothing is labelled to bring forward.');
		return 0;
	}
	run(root, 'git', ['fetch', '-q', 'origin', integration]);
	const tipSha = run(root, 'git', ['rev-parse', `origin/${integration}`]);
	const origin = run(root, 'git', ['remote', 'get-url', 'origin']);
	for (const pull of pulls) {
		const label = `#${String(pull.number)} (${pull.headRefName})`;
		if (!apply) {
			console.log(
				`bring-forward: would bring ${label} up to ${tipSha.slice(0, 12)}`,
			);
			continue;
		}
		run(root, 'git', ['fetch', '-q', 'origin', pull.headRefOid]);
		const clone = throwawayClone(root, [pull.headRefOid]);
		try {
			const built = assembleTrain({
				root: clone.dir,
				remote: clone.dir,
				tipSha,
				ref: pull.headRefName,
				members: [
					{
						number: pull.number,
						headRef: pull.headRefName,
						headSha: pull.headRefOid,
					},
				],
				derived: REGENERATED_PROJECTIONS,
				regenerate: regenerateWith(GENERATED_REFRESH_COMMANDS),
				linkDependencies: linkDependenciesFrom(root),
				rehearsal: true,
			});
			if (built.scratch === undefined || built.conflicting.length > 0) {
				console.log(
					`bring-forward: ${label} conflicts in authored code: its author updates it.`,
				);
				if (built.scratch !== undefined)
					discardTrain(clone.dir, built.scratch);
				continue;
			}
			try {
				// Not forced: a head that moved since the listing is the
				// author's, and the next pass reads it again.
				run(built.scratch, 'git', [
					'push',
					'-q',
					origin,
					`HEAD:refs/heads/${pull.headRefName}`,
				]);
				run(root, 'gh', [
					'api',
					'-X',
					'DELETE',
					`repos/{owner}/{repo}/issues/${String(pull.number)}/labels/${encodeURIComponent(LAND_LABEL_NEEDS_UPDATE)}`,
				]);
				console.log(
					`bring-forward: brought ${label} up to ${tipSha.slice(0, 12)}`,
				);
			} catch (error) {
				console.log(
					`bring-forward: ${label} not pushed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
				);
			} finally {
				discardTrain(clone.dir, built.scratch);
			}
		} finally {
			clone.dispose();
		}
	}
	return 0;
};

if (import.meta.main) process.exit(main());
