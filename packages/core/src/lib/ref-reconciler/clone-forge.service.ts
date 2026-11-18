/**
 * clone-forge.service.ts — `IRefForge` over a clone: the delivered units
 * the reconciler ends, with every rule the unit reaper kept.
 *
 * What the reaper judged is judged here, from the same standings: a
 * delivered unit, a landed unit whose owner is idle, and an abandoned unit
 * that carries nothing or whose tip the remote keeps as retired, are
 * spent. A unit anybody is on, or whose worktree holds an edit of its own,
 * is kept and reported; an abandoned unit's uncommitted edits are kept on
 * the forge first, and the unit leaves only when they were. A unit still
 * inside its owner's lease window (an empty unit included) never reaches
 * the snapshot, so it is never ended. A spent unit's tip is held by the
 * integration branch, a publication or a retired ref, so no action here
 * deletes a commit that exists nowhere else.
 *
 * The clone is touched only through `ICloneForgePorts`; `cloneForgePortsAt`
 * is the real one.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type {
	ICloneForgePorts,
	ICloneUnit,
	IReconcileAction,
	IReconcilerUnit,
	IRefForge,
	IRefSnapshot,
} from '../contracts/interfaces/ref-reconciler.interface';
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
import { RefReconcilerService } from './reconciler.service';

/** `IRefForge` over a clone: it lists only the units that end. */
export class CloneForgeService implements IRefForge {
	/** What became of every spent unit, for the caller's report. */
	readonly outcomes = new Map<string, IReapedUnit>();
	private readonly tips = new Map<string, string>();
	private readonly keepEditsOf = new Map<string, string>();
	private readonly notKept = new Set<string>();

	constructor(
		private readonly ports: ICloneForgePorts,
		private readonly applying = true,
	) {}

	async snapshot(): Promise<IRefSnapshot> {
		const ports = this.ports;
		const units: IReconcilerUnit[] = [];
		for (const unit of await ports.units()) {
			const tip = ports.tipOf(unit.ref);
			if (tip === undefined || !this.spent(unit, tip)) continue;
			const worktree = ports.worktreeOf(unit.ref);
			const state =
				worktree === null
					? { edited: [], regenerable: [] }
					: ports.inspect(worktree);
			const base = {
				ref: unit.ref,
				worktree,
				edited: state.edited,
				regenerable: state.regenerable,
			};
			const alive = await ports.alive(unit.ref, worktree);
			const keepable =
				state.edited.length > 0 &&
				unit.standing === 'abandoned' &&
				worktree !== null;
			const inUse = alive || (state.edited.length > 0 && !keepable);
			this.tips.set(unit.ref, tip);
			if (keepable && !inUse && worktree !== null) {
				this.keepEditsOf.set(unit.ref, worktree);
			}
			this.outcomes.set(unit.ref, {
				...base,
				outcome: inUse
					? 'kept'
					: this.applying
						? 'kept'
						: keepable
							? 'would-retire'
							: 'would-remove',
			});
			units.push({
				ref: unit.ref,
				hasBranch: true,
				worktree:
					worktree === null ? 'none' : inUse ? 'in-use' : 'clean',
				tip,
				landed: true,
				holdsWork: false,
				behind: false,
				retired: false,
				// Delivered, landed, carrying nothing or kept as retired.
				tipHeldElsewhere: true,
				silentSeconds: unit.silentSeconds ?? 0,
			});
		}
		return {
			units,
			refs: [],
			pullRequests: [],
			now: Math.floor(Date.now() / 1000),
		};
	}

	async apply(action: IReconcileAction): Promise<void> {
		const ports = this.ports;
		if (!this.applying) {
			ports.report(`would ${action.kind} ${action.ref}`);
			return;
		}
		switch (action.kind) {
			case 'remove-worktree': {
				// The worktree goes with the branch, after the edits are kept.
				const worktree = this.keepEditsOf.get(action.ref);
				if (worktree === undefined) return;
				const keptAt = ports.keepEdits(action.ref, worktree);
				const entry = this.outcomes.get(action.ref);
				if (keptAt === undefined || entry === undefined) {
					this.notKept.add(action.ref);
					ports.report(
						`could not keep the edits of ${action.ref}; the unit stays`,
					);
					return;
				}
				this.outcomes.set(action.ref, { ...entry, keptAt });
				return;
			}
			case 'delete-branch': {
				const tip = this.tips.get(action.ref);
				const entry = this.outcomes.get(action.ref);
				if (
					tip === undefined ||
					entry === undefined ||
					this.notKept.has(action.ref)
				) {
					return;
				}
				const editsKept = entry.keptAt !== undefined;
				const gone = await ports.removeCheckout(
					action.ref,
					tip,
					editsKept,
				);
				if (gone && !editsKept) ports.dropForgeCopy(action.ref, tip);
				this.outcomes.set(action.ref, {
					...entry,
					outcome: !gone ? 'kept' : editsKept ? 'retired' : 'removed',
				});
				ports.report(`${gone ? 'ended' : 'kept'} ${action.ref}`);
				return;
			}
			default:
				// Nothing else is a clone action of a spent unit.
				throw new Error(
					`${action.kind} is not a clone action (${action.ref})`,
				);
		}
	}

	private spent(unit: ICloneUnit, tip: string): boolean {
		const ports = this.ports;
		// Landed whoever owns it: an idle owner holds nothing the integration
		// branch lacks, even while its proposal is in progress for other slices.
		const landedAndIdle =
			unit.standing === 'idle' &&
			unit.delivered &&
			(ports.isLanded(tip) || ports.carriesNothing(unit.ref));
		return (
			unit.standing === 'delivered' ||
			landedAndIdle ||
			(unit.standing === 'abandoned' &&
				(ports.carriesNothing(unit.ref) || ports.keptOnRemote(tip)))
		);
	}
}

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
