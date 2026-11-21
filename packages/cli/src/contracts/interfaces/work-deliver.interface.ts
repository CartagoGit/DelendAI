import type { ICliCommandResult } from './cli-command.interface';

/** What delivering needs from the unit engine and the proposals tool. */
export interface IWorkDeliverPorts {
	/** The slice this unit was entered for; `all` for a whole proposal. */
	readonly slice: string;
	/** Records a failed delivery in the project's self-learning store; never throws. */
	readonly recordFailure?: (failure: {
		readonly source: 'gate' | 'deliverRefusal';
		readonly subject: string;
		readonly unit: string;
	}) => Promise<void>;
	/** Publish the unit alone, without handing the proposal to review. */
	readonly publish: () => Promise<ICliCommandResult>;
	/** The URL of the open pull request for a published branch, one forge read; undefined when none or the read failed. */
	readonly readOpenPullRequest: (
		branch: string,
	) => Promise<string | undefined>;
	/** Whether the remote holds the publication with the unit's head in it (waits for a detached publication). */
	readonly publicationReached: (
		publication: string,
		checkout: string | undefined,
	) => Promise<boolean>;
	readonly locate: () => Promise<ICliCommandResult>;
	/**
	 * The proof's cheap static gates, scoped to the change, run before the
	 * compute slot is taken (`work prove --only=precheck`).
	 */
	readonly precheck: () => Promise<ICliCommandResult>;
	/**
	 * Coverage of the changed modules by their mirror specs alone, after the
	 * static pre-check and before the slot (`work prove --only=coverage-precheck`).
	 */
	readonly coveragePrecheck: () => Promise<ICliCommandResult>;
	readonly prove: () => Promise<ICliCommandResult>;
	/** Ask the tool whether the hand-over would be accepted; nothing is moved. */
	readonly preflight: (checkout: string | undefined) => Promise<unknown>;
	readonly transition: (
		to: 'in-progress' | 'review',
		checkout: string | undefined,
	) => Promise<unknown>;
}

/** What one `work deliver` runs on: the proposal, the reason, the unit's flags. */
export interface IDeliverRun {
	readonly id: string;
	readonly reason: string;
	readonly agent: string | undefined;
	readonly urgent: string | undefined;
	readonly unitFlags: readonly string[];
}
