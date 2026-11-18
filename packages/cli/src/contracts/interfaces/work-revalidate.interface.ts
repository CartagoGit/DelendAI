/** work-revalidate.interface.ts — the shapes `work revalidate` selects over. */

/** One slice of a proposal, as far as the selection reads it. */
export interface IRevalidateSlice {
	readonly id: string;
	readonly status: string;
	readonly shippedIn: string | undefined;
	readonly reviewState: string | undefined;
}

/** One proposal, as far as the selection reads it. */
export interface IRevalidateProposal {
	readonly id: string;
	/** The folder stage the document sits in (`ready`, `in-progress`, ...). */
	readonly stage: string;
	readonly slices: readonly IRevalidateSlice[];
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
export interface IWorkRevalidatePorts {
	readonly proposals: () => Promise<readonly IRevalidateProposal[]>;
	readonly print: (line: string) => void;
}
