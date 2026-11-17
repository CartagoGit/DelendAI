/** The input and output of the one pull request and issue text template. */
import type { CHANGE_TEXT_TYPES } from '../constants/change-text.constant';

/** A conventional-commit type a title may carry. */
export type IChangeTextType = (typeof CHANGE_TEXT_TYPES)[number];

/** The proposal types a work title may take its type from. */
export type IChangeTextProposalKind = Exclude<IChangeTextType, 'review'>;

/** The kinds of change text the template renders. */
export type IChangeTextKind =
	| 'implement'
	| 'review'
	| 'create'
	| 'batch-close'
	| 'issue';

/** One proposal and the slices of it a change carries. */
export interface IChangeTextProposalRef {
	/** The proposal id, such as `x01003`. */
	readonly proposal: string;
	/** The slice ids shipped, such as `S1`; empty when the whole proposal. */
	readonly slices?: readonly string[] | undefined;
}

/** One step the change was proved by. */
export interface IChangeTextProofStep {
	readonly step: string;
	readonly durationMs: number;
}

/** One verdict a review pack carries. */
export interface IChangeTextVerdict {
	readonly proposal: string;
	readonly verdict: string;
}

/**
 * The text a caller may set. The type, the scope and the section order are
 * not here: the template derives them, so no caller can override them.
 */
export interface IChangeTextFields {
	/** The one-line summary; the template truncates it to fit the title. */
	readonly summary: string;
	/** The proposals (and slices) the change carries. */
	readonly proposals: readonly IChangeTextProposalRef[];
	/** The repository paths the change touches; the scope is derived. */
	readonly files?: readonly string[] | undefined;
	/** Why, from the proposal. */
	readonly why?: string | undefined;
	/** Free text for the What section; the summary when absent. */
	readonly what?: string | undefined;
	/** The proof steps; absent or empty reads "not proved locally". */
	readonly proof?: readonly IChangeTextProofStep[] | undefined;
	/** Notes for the reviewer. */
	readonly reviewNotes?: string | undefined;
}

/** A change that implements slices, or opens or closes proposals. */
export interface IWorkChangeTextInput extends IChangeTextFields {
	readonly kind: 'implement' | 'create' | 'batch-close';
	/** The proposal's kind; `implement` takes its title type from it. */
	readonly proposalKind?: IChangeTextProposalKind | undefined;
	/** The slice titles shipped, for the Slices shipped section. */
	readonly slicesShipped?: readonly string[] | undefined;
}

/** A review pack. */
export interface IReviewChangeTextInput extends IChangeTextFields {
	readonly kind: 'review';
	readonly verdicts?: readonly IChangeTextVerdict[] | undefined;
}

/** An issue. */
export interface IIssueChangeTextInput {
	readonly kind: 'issue';
	readonly summary: string;
	readonly proposals?: readonly IChangeTextProposalRef[] | undefined;
	/** The paths or components where it happens; the scope is derived. */
	readonly files?: readonly string[] | undefined;
	readonly where?: string | undefined;
	readonly evidence?: string | undefined;
	readonly expected?: string | undefined;
	readonly actual?: string | undefined;
	/** A link to the proposal that tracks it. */
	readonly proposalLink?: string | undefined;
}

/** What the template accepts. */
export type IChangeTextInput =
	| IWorkChangeTextInput
	| IReviewChangeTextInput
	| IIssueChangeTextInput;

/** What the template renders. */
export interface IChangeText {
	readonly title: string;
	readonly body: string;
}
