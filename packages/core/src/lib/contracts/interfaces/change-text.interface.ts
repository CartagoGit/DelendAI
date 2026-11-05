/** The conventional type of a change request or issue title. */
export type IChangeType =
	| 'feat'
	| 'fix'
	| 'docs'
	| 'perf'
	| 'refactor'
	| 'test'
	| 'chore'
	| 'review';

/** What opened the text: each kind has one body shape. */
export type IChangeKind =
	| 'implement'
	| 'review'
	| 'create'
	| 'batch-close'
	| 'issue';

/** A proposal and the slices of it a change carries (empty: all of it). */
export interface IProposalUnit {
	readonly proposal: string;
	readonly slices?: readonly string[];
}

export interface IChangeSlice {
	readonly id: string;
	readonly title?: string;
}

export interface IChangeVerdict {
	readonly proposal: string;
	readonly verdict: string;
}

export interface IProofStep {
	readonly name: string;
	readonly seconds: number;
	readonly ok: boolean;
}

/**
 * Everything the template takes. No field names the author: the same
 * input yields the same text whichever agent, model or host made it.
 */
export interface IChangeTextInput {
	readonly kind: IChangeKind;
	readonly type: IChangeType;
	/** Where the change lands: one lowercase word or path-like name. */
	readonly scope: string;
	/** What the change does; the template shapes and bounds it. */
	readonly summary: string;
	readonly units: readonly IProposalUnit[];
	/** From the proposal. */
	readonly why?: string;
	readonly slices?: readonly IChangeSlice[];
	readonly verdicts?: readonly IChangeVerdict[];
	readonly files?: readonly string[];
	/** `undefined`: the change was not proved locally. */
	readonly proof?: readonly IProofStep[];
	readonly reviewNotes?: readonly string[];
}

export interface IIssueTextInput {
	readonly type: IChangeType;
	readonly scope: string;
	readonly summary: string;
	readonly units?: readonly IProposalUnit[];
	readonly where: string;
	readonly evidence: string;
	readonly expected: string;
	readonly actual: string;
	readonly proposalLink?: string;
}

export interface IChangeText {
	readonly title: string;
	readonly body: string;
}
