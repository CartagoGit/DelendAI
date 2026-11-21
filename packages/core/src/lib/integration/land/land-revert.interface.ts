/** Contract shapes of the repair of a red integration branch (see land-revert.helper). */
import type {
	IDevelopMerge,
	IDevelopRedPorts,
	ILandForge,
} from './land.interface';

/** What a revert built in a throwaway index came to. */
export type ILandRevertBuild =
	| { readonly kind: 'built'; readonly sha: string }
	| { readonly kind: 'conflict' }
	| { readonly kind: 'failed'; readonly reason: string };

/** The git side of a repair: `git revert -m 1` over the tip, never in a checkout. */
export interface ILandRevertGit {
	/** Revert `merge` over `tip` and push the result as `ref`; nothing is pushed unless it is `built`. */
	revertMerge(input: {
		readonly ref: string;
		readonly tip: string;
		readonly merge: IDevelopMerge;
	}): ILandRevertBuild;
}

/** What a repair pull request records in its body, read back by the next pass. */
export interface ILandRepairRecord {
	readonly culprit: number;
	/** The specs the culprit's red run failed. */
	readonly failing: readonly string[];
	/** The failing set already known on the red commit: a failure outside it is new. */
	readonly known: readonly string[];
}

/** What one `openRepair` came to. */
export type ILandRepairOutcome =
	| { readonly kind: 'opened'; readonly number: number }
	| { readonly kind: 'exists'; readonly number: number }
	| { readonly kind: 'needs-person'; readonly reason: string };

/** The verdict on a repair's own run. */
export type ILandRepairVerdict =
	| { readonly kind: 'wait' }
	| { readonly kind: 'merge' }
	| { readonly kind: 'reject'; readonly why: string };

/** A completed run of the integration branch's CI. */
export interface ILandCiRun {
	readonly commit: string;
	readonly conclusion: string;
}

/** What the repair pass reads: the forge, the git port and the CI's own history. */
export interface ILandRepairPorts {
	readonly forge: ILandForge;
	readonly git: ILandRevertGit;
	/** Completed CI runs of the integration branch, newest first. */
	recentRuns(): Promise<readonly ILandCiRun[]>;
	/** The section a failed check reports, as the project names it. */
	readonly sectionOfCheck: (name: string) => string | undefined;
	readonly develop: IDevelopRedPorts;
	/** Where the repairs' branches live: `<ns>/queue/repair/`. */
	readonly repairPrefix: string;
	readonly note: (line: string) => void;
}

/** What the repair pass came to. */
export type ILandRepairResult =
	| ILandRepairOutcome
	| { readonly kind: 'nothing'; readonly why: string };
