/**
 * clone-forge-ports.service.ts — the real ports of `CloneForgeService`
 * over a clone's git, and the one call that ends its delivered units.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { ICloneForgePorts } from '../contracts/interfaces/ref-reconciler.interface';
import { ownedRootsOf } from '../work-units/namespaced-ref.helper';
import { carriesNothingBeyond } from '../work-units/landed-work.service';
import { keepUncommittedEdits } from '../work-units/unit-edits-kept.service';
import type { IReapedUnit } from '../work-units/unit-lease.interface';
import { unitLifeReader } from '../work-units/unit-liveness.service';
import {
	dropForgeCopy,
	removeUnitCheckout,
	worktreeOfRef,
} from '../work-units/unit-removal.service';
import { readUnitStandings } from '../work-units/unit-standings.service';
import { inspectWorktree } from '../work-units/unit-worktree-state.service';
import {
	integrationBase,
	integrationRemote,
	readGit,
} from '../work-units/work-unit-shared.service';
import { CloneForgeService } from './clone-forge.service';
import { RefReconcilerService } from './reconciler.service';

/** The ports of the clone at `root`. */
export const cloneForgePortsAt = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly now?: number | undefined;
	readonly report?: (line: string) => void;
}): ICloneForgePorts => {
	const { root, policy, now } = input;
	const integration = integrationBase(root, policy);
	const remote = integrationRemote(root, policy);
	const lifeOf = unitLifeReader({ root, policy, now });
	let retiredTips: ReadonlySet<string> | undefined;
	const retired = (): ReadonlySet<string> => {
		retiredTips ??= new Set(
			(
				readGit(root, [
					'ls-remote',
					'--',
					remote,
					...ownedRootsOf(policy.branches, 'retired', '*'),
				]) ?? ''
			)
				.split('\n')
				.map((line) => line.split('\t')[0] ?? '')
				.filter((sha) => sha.length > 0),
		);
		return retiredTips;
	};
	return {
		units: async () =>
			(
				await readUnitStandings({
					root,
					policy,
					...(now === undefined ? {} : { now }),
				})
			).map((unit) => ({
				ref: unit.ref,
				standing: unit.standing,
				delivered: unit.delivered === true,
				silentSeconds: unit.silentSeconds,
			})),
		tipOf: (ref) =>
			readGit(root, ['rev-parse', '-q', '--verify', `refs/heads/${ref}`]),
		worktreeOf: (ref) => worktreeOfRef(root, ref) ?? null,
		inspect: inspectWorktree,
		isLanded: (sha) =>
			integration !== undefined &&
			readGit(root, ['merge-base', '--is-ancestor', sha, integration]) !==
				undefined,
		carriesNothing: (ref) =>
			integration !== undefined &&
			carriesNothingBeyond(root, `refs/heads/${ref}`, integration),
		keptOnRemote: (sha) => retired().has(sha),
		alive: async (ref, worktree) => (await lifeOf({ ref, worktree })).alive,
		keepEdits: (ref, worktree) =>
			keepUncommittedEdits({ root, policy, remote, ref, worktree }),
		removeCheckout: async (ref, tip, editsKept) =>
			(
				await removeUnitCheckout(root, ref, {
					policy,
					tip,
					...(editsKept ? { editsKept } : {}),
					now,
				})
			).deletedBranch,
		dropForgeCopy: (ref, tip) => {
			dropForgeCopy(root, remote, ref, tip);
		},
		report: input.report ?? (() => undefined),
	};
};

/** End the delivered units of the clone at `root` through one reconciler pass. */
export const endDeliveredUnits = async (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly apply: boolean;
	readonly now?: number | undefined;
}): Promise<readonly IReapedUnit[]> => {
	const forge = new CloneForgeService(cloneForgePortsAt(input), input.apply);
	await new RefReconcilerService(forge, input.policy.branches).pass();
	return [...forge.outcomes.values()];
};
