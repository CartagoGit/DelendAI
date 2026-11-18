/** work-revalidate.interface.ts — the shapes `work revalidate` selects over. */

/** One slice of a proposal, as far as the selection reads it. */
export interface IRevalidateSlice {
	readonly id: string;
	readonly status: string;
	readonly shippedIn: string | undefined;
	readonly reviewState: string | undefined;
	/** The literal paths the slice's Files line declares. */
	readonly files?: readonly string[] | undefined;
}

/** One proposal, as far as the selection reads it. */
export interface IRevalidateProposal {
	readonly id: string;
	/** The folder stage the document sits in (`ready`, `in-progress`, ...). */
	readonly stage: string;
	readonly slices: readonly IRevalidateSlice[];
	/** The document's path relative to the project root, when read from disk. */
	readonly file?: string;
}

/** A proposal left out, and why. */
export interface IRevalidateRefusal {
	readonly id: string;
	readonly reason: string;
}

/** The outcome of a selection. */
export interface IRevalidateSelection {
	readonly chosen: readonly string[];
	readonly refused: readonly IRevalidateRefusal[];
}

/** The ports the command runs on. */
export interface IRevalidateReadPorts {
	readonly proposals: () => Promise<readonly IRevalidateProposal[]>;
	/** The proposals a live unit holds, here or on the forge. */
	readonly heldByUnits: () => Promise<ReadonlySet<string>>;
	readonly print: (line: string) => void;
}

/** The ports the batch's unit and transitions run on. */
export interface IRevalidateUnitPorts {
	/** Enters the one unit of the batch; the worktree it prints. */
	readonly enter: () => Promise<string>;
	/** The integration commit the batch is validated at. */
	readonly developSha: (worktree: string) => Promise<string | undefined>;
	/** The unit's current tip, to return to when a proposal fails. */
	readonly mark: (worktree: string) => string | undefined;
	/** Drops what a failed proposal left in the unit, back to `mark`. */
	readonly undo: (worktree: string, mark: string) => void;
	/** Publishes the unit once, by the existing publish path, with no title of its own. */
	readonly publish: () => Promise<{
		readonly code: number;
		readonly data?: unknown;
		readonly error?: string | undefined;
	}>;
	/** One transition of the proposals service, committed by the flow. */
	readonly transition: (input: {
		readonly id: string;
		readonly to: 'in-progress' | 'review' | 'retired';
		readonly reason: string;
		readonly worktree: string;
		/** The proposal whose change made this one obsolete, when retiring. */
		readonly supersededBy?: string;
	}) => Promise<unknown>;
	/** Whether `path` exists in the unit's checkout. */
	readonly exists: (worktree: string, path: string) => boolean;
	/** One git command in the unit's checkout. */
	readonly git: (
		worktree: string,
		args: readonly string[],
	) => { readonly ok: boolean; readonly out: string };
	/** Rewrites `from` to `to` in one slice's Files line and commits it; the refusal, if any. */
	readonly rewriteDeclared: (input: {
		readonly worktree: string;
		readonly file: string;
		readonly sliceId: string;
		readonly from: string;
		readonly to: string;
	}) => string | undefined;
}

/** What the batch did. */
export interface IRevalidateOutcome extends IRevalidateSelection {
	readonly worktree?: string;
	readonly transitioned: readonly string[];
	/** Proposals moved to retired because a later change deleted their files. */
	readonly retired?: readonly string[];
	readonly failed: readonly IRevalidateRefusal[];
	/** What publishing the batch answered; absent when nothing was transitioned. */
	readonly publication?: unknown;
}

/** Every port the command runs on. */
export interface IWorkRevalidatePorts
	extends IRevalidateReadPorts,
		IRevalidateUnitPorts {}
