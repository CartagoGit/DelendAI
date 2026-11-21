/**
 * carried-units.service.ts — a unit whose work another unit of the same
 * agent published ends with that publication.
 *
 * An agent stacks units: it enters a slice, merges an earlier slice's
 * unit into it, and publishes the later one carrying both. The earlier
 * unit's work is then published, and nothing ended its branch: the forge
 * reaper only takes a unit's own publication as proof, so the branch
 * stayed on the forge for good (x00877 S7, carried by S5's #891). The
 * publisher is the one place that knows what it carried.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkPublishStep } from '../contracts/interfaces/work-publish.interface';
import { workUnitIdentityOf } from '../development-policy/git-guard-unit';
import { gitCommonDirOf } from './unit-lease.service';
import { readUnitLease } from './unit-lease.store';
import { listWorkRefs } from './work-swarm.service';
import { endWorkRef } from './work-publish.service';
import { readGit } from './work-unit-shared.service';

/**
 * End every other work ref of `workRef`'s agent and proposal whose tip
 * the published `tip` contains, here and on `remote`. A unit entered on
 * top and not committed to yet is left alone: its tip is where it
 * started, not work of its own.
 */
export const endCarriedUnits = async (input: {
	readonly root: string;
	readonly cwd: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly workRef: string;
	readonly tip: string;
	readonly remote: string;
}): Promise<readonly IWorkPublishStep[]> => {
	const { root, policy } = input;
	const short = (ref: string): string => ref.replace(/^refs\/heads\//u, '');
	const mine = workUnitIdentityOf(policy, short(input.workRef));
	if (mine === undefined) return [];
	const common = gitCommonDirOf(root);
	const steps: IWorkPublishStep[] = [];
	for (const [name, sha] of listWorkRefs(root, policy)) {
		if (name === short(input.workRef)) continue;
		const other = workUnitIdentityOf(policy, name);
		if (other?.agent !== mine.agent || other.proposal !== mine.proposal) {
			continue;
		}
		const carried =
			readGit(root, ['merge-base', '--is-ancestor', sha, input.tip]) !==
			undefined;
		if (!carried) continue;
		const lease =
			common === undefined
				? undefined
				: await readUnitLease(common, name);
		if (lease?.entrySha === sha) continue;
		const ended = endWorkRef({
			root,
			cwd: input.cwd,
			workRef: `refs/heads/${name}`,
			tip: sha,
			remote: input.remote,
		});
		steps.push(
			...ended.steps.map((step) => ({
				...step,
				name: `carried-${step.name}`,
			})),
		);
	}
	return steps;
};
