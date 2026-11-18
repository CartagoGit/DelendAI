/**
 * ref-reconciler.interface.ts — what the reconciler observes, what it
 * decides and the port through which it acts.
 */
import type { RECONCILE_TRIGGERS } from '../constants/ref-kinds.constant';
import type {
	IObservedPullRequest,
	IObservedRef,
	IRefVerdict,
} from '../../ref-lifecycle/reconcile.interface';

/** A unit as the registry and the clone know it, plus what the forge says of it. */
export interface IReconcilerUnit {
	/** The unit's work ref. */
	readonly ref: string;
	/** The local branch exists. */
	readonly hasBranch: boolean;
	/** `none`, a clean one nobody stands in, or one in use. */
	readonly worktree: 'none' | 'clean' | 'in-use';
	/** The unit's tip, when the branch exists. */
	readonly tip?: string | undefined;
	/** The integration branch holds every commit of the tip. */
	readonly landed: boolean;
	/** The tip is the integration tip, or the unit carries nothing of its own. */
	readonly holdsWork: boolean;
	/** The integration branch moved past the unit's base. */
	readonly behind: boolean;
	/** The unit was retired on purpose (`work retire`). */
	readonly retired: boolean;
	/** The unit's pull request, when it has one. */
	readonly pullRequest?: 'open' | 'merged' | 'closed' | undefined;
	/** Every commit of the tip is held by the integration branch, a work, a publication or a retired ref. */
	readonly tipHeldElsewhere: boolean;
	/** Seconds since the unit's last commit or heartbeat. */
	readonly silentSeconds: number;
}

/** What one pass reads. */
export interface IRefSnapshot {
	readonly units: readonly IReconcilerUnit[];
	/** Every branch on the forge. */
	readonly refs: readonly IObservedRef[];
	readonly pullRequests: readonly IObservedPullRequest[];
	/** Seconds since the epoch. */
	readonly now: number;
}

/** One step the reconciler takes. */
export type IReconcileAction =
	| { readonly kind: 'create-branch'; readonly ref: string }
	| { readonly kind: 'create-worktree'; readonly ref: string }
	| { readonly kind: 'fast-forward'; readonly ref: string }
	| {
			readonly kind: 'keep-tip';
			readonly ref: string;
			readonly sha: string;
	  }
	| { readonly kind: 'delete-branch'; readonly ref: string }
	| { readonly kind: 'remove-worktree'; readonly ref: string }
	| { readonly kind: 'delete-forge-ref'; readonly ref: string };

/** What the reconciler reports and does not act on. */
export interface IReconcileReport {
	readonly ref: string;
	readonly reason: string;
}

/** The desired state: what to do, and what is only reported. */
export interface IDesiredState {
	readonly actions: readonly IReconcileAction[];
	readonly reported: readonly IReconcileReport[];
	/** The classifier's verdicts for the forge's refs. */
	readonly verdicts: readonly IRefVerdict[];
}

/** How long a unit may sit empty, and the other time limits, from the project's policy. */
export interface IReconcilerSettings {
	/** An empty unit with a clean worktree older than this is retired. */
	readonly emptyUnitGraceSeconds: number;
}

/** The port through which a pass reads and changes the forge and the clone. */
export interface IRefForge {
	snapshot(): Promise<IRefSnapshot>;
	apply(action: IReconcileAction): Promise<void>;
}

/** A kind of ref and the folder, under the namespace, it lives in. */
export interface IRefKind {
	readonly kind: string;
	/** The first path segment under `<namespace>/`. */
	readonly segment: string;
}

/** What starts a reconciler pass. */
export type IReconcileTrigger = (typeof RECONCILE_TRIGGERS)[number];

/** What starting a pass may touch: whether the script exists, and launching it. */
export interface IReconcilerRunPorts {
	readonly exists: (script: string) => Promise<boolean>;
	readonly spawn: (script: string, args: readonly string[]) => void;
}
