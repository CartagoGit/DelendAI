/**
 * desired-state.helper.ts — what every ref and unit should be, from one
 * snapshot, as a pure function.
 *
 * The forge-side verdicts come from the ref classifier
 * (`reconcileRefs`), never from a second reading of the same rule. A
 * unit's own transitions are decided here. The one invariant: no action
 * deletes a commit that exists nowhere else; such a tip is kept under
 * the retired namespace first, or the ref is kept and reported.
 */
import type { IPolicyBranches } from '../contracts/interfaces/development-policy.interface';
import type {
	IDesiredState,
	IReconcileAction,
	IReconcileReport,
	IReconcilerSettings,
	IReconcilerUnit,
	IRefKind,
	IRefSnapshot,
} from '../contracts/interfaces/ref-reconciler.interface';
import { REF_KINDS } from '../contracts/constants/ref-kinds.constant';
import { reconcileRefs } from '../ref-lifecycle/reconcile.service';

const endsUnit = (unit: IReconcilerUnit): string | undefined => {
	if (unit.retired) return 'the unit was retired';
	if (unit.landed) return 'its work landed';
	if (unit.pullRequest === 'merged') return 'its pull request merged';
	if (unit.pullRequest === 'closed') return 'its pull request closed';
	return undefined;
};

const isEmpty = (
	unit: IReconcilerUnit,
	settings: IReconcilerSettings,
): boolean =>
	unit.hasBranch &&
	!unit.holdsWork &&
	unit.worktree === 'clean' &&
	unit.silentSeconds > settings.emptyUnitGraceSeconds;

const retireSteps = (unit: IReconcilerUnit): readonly IReconcileAction[] => [
	// The tip is kept before anything goes, unless something else holds it.
	...(unit.tipHeldElsewhere || unit.tip === undefined
		? []
		: [{ kind: 'keep-tip', ref: unit.ref, sha: unit.tip } as const]),
	...(unit.worktree === 'clean'
		? [{ kind: 'remove-worktree', ref: unit.ref } as const]
		: []),
	{ kind: 'delete-branch', ref: unit.ref },
];

const unitSteps = (
	unit: IReconcilerUnit,
	settings: IReconcilerSettings,
	actions: IReconcileAction[],
	reported: IReconcileReport[],
): void => {
	const ending = endsUnit(unit);
	if (ending !== undefined || isEmpty(unit, settings)) {
		if (!unit.hasBranch) return;
		if (unit.worktree === 'in-use') {
			reported.push({
				ref: unit.ref,
				reason: `${ending ?? 'it is empty'}, but its worktree is in use: kept until nobody stands in it`,
			});
			return;
		}
		if (unit.tip === undefined && !unit.tipHeldElsewhere) {
			reported.push({
				ref: unit.ref,
				reason: 'its tip is unknown, so nothing is deleted',
			});
			return;
		}
		actions.push(...retireSteps(unit));
		return;
	}
	if (!unit.hasBranch) {
		actions.push({ kind: 'create-branch', ref: unit.ref });
		actions.push({ kind: 'create-worktree', ref: unit.ref });
		return;
	}
	if (unit.worktree === 'none') {
		actions.push({ kind: 'create-worktree', ref: unit.ref });
	}
	if (unit.behind) {
		if (unit.holdsWork) {
			reported.push({
				ref: unit.ref,
				reason: 'the integration branch moved and the unit holds work of its own: its owner brings it forward',
			});
		} else {
			actions.push({ kind: 'fast-forward', ref: unit.ref });
		}
	}
};

/** The desired state of every unit and forge ref in `snapshot`. */
export const desiredState = (
	snapshot: IRefSnapshot,
	branches: IPolicyBranches,
	settings: IReconcilerSettings,
): IDesiredState => {
	const actions: IReconcileAction[] = [];
	const reported: IReconcileReport[] = [];
	const unitRefs = new Set(snapshot.units.map((unit) => unit.ref));
	for (const unit of snapshot.units) {
		unitSteps(unit, settings, actions, reported);
	}
	const result = reconcileRefs(
		snapshot.refs,
		snapshot.pullRequests,
		branches,
		{ now: snapshot.now },
	);
	// A unit's own ref is decided above, from the registry.
	for (const verdict of result.reapable) {
		if (!unitRefs.has(verdict.name)) {
			actions.push({ kind: 'delete-forge-ref', ref: verdict.name });
		}
	}
	for (const verdict of result.retirable) {
		const sha = snapshot.refs.find((ref) => ref.name === verdict.name)?.sha;
		if (sha === undefined) {
			reported.push({
				ref: verdict.name,
				reason: 'closed unmerged and its tip is unknown: kept',
			});
			continue;
		}
		actions.push({ kind: 'keep-tip', ref: verdict.name, sha });
		actions.push({ kind: 'delete-forge-ref', ref: verdict.name });
	}
	for (const verdict of result.needsAttention) {
		if (!result.reapable.some((r) => r.name === verdict.name)) {
			reported.push({ ref: verdict.name, reason: verdict.reason });
		}
	}
	return { actions, reported, verdicts: result.verdicts };
};

/** The kind a ref names, or `undefined` when no listed kind owns its folder. */
export const refKindOf = (
	name: string,
	namespace: string,
): IRefKind | undefined => {
	if (!name.startsWith(`${namespace}/`)) return undefined;
	const segment = name.slice(namespace.length + 1).split('/')[0];
	return REF_KINDS.find((kind) => kind.segment === segment);
};
