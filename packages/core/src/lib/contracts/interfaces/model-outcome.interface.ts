/** How a hop ended, as far as the task's own acceptance says. */
export type IModelOutcomeVerdict =
	| 'accepted'
	| 'rejected'
	| 'failed'
	| 'unknown';

/** What a hop cost, and how that figure is known. */
export interface IModelOutcomeCost {
	readonly amount: number;
	readonly unit: 'usd' | 'credits' | 'requests';
	/** Read from the vendor, estimated from tokens, or part of a plan. */
	readonly kind: 'measured' | 'estimated' | 'included-in-plan';
}

/**
 * One record of how a model did on one task: the store every component
 * that learns or ranks reads, so they all reason from the same history.
 */
export interface IModelOutcome {
	readonly providerId: string;
	readonly accountId?: string | undefined;
	/** The kind of task (`implement`, `review`, …), free text, redacted. */
	readonly taskKind?: string | undefined;
	readonly outcome: IModelOutcomeVerdict;
	readonly tokensIn?: number | undefined;
	readonly tokensOut?: number | undefined;
	readonly cost?: IModelOutcomeCost | undefined;
	readonly latencyMs?: number | undefined;
	readonly retries?: number | undefined;
	/** The runner's invocation it came from, to join its journal. */
	readonly invocationId?: string | undefined;
	readonly at: string;
}

/** The append-only store of outcomes. */
export interface IModelOutcomeStore {
	readonly append: (
		outcome: Omit<IModelOutcome, 'at'> & { readonly at?: string },
	) => Promise<void>;
	readonly readAll: () => Promise<readonly IModelOutcome[]>;
}
