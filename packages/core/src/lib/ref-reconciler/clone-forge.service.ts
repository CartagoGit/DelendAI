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
 * The clone is touched only through `ICloneForgePorts`; the real ones are
 * in `clone-forge-ports.service.ts`.
 */
import type {
	ICloneForgePorts,
	ICloneUnit,
	IReconcileAction,
	IReconcilerUnit,
	IRefForge,
	IRefSnapshot,
} from '../contracts/interfaces/ref-reconciler.interface';
import type { IReapedUnit } from '../work-units/unit-lease.interface';

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
