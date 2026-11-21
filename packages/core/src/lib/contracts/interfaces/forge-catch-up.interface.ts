/**
 * forge-catch-up.interface.ts — what a host asks the forge once when it
 * (re)connects: what became true of the pull requests sessions wait on.
 */

/**
 * The fields of a forge event the catch-up reads and tells. The forge
 * plugin's `IForgeEvent` has all of them, so it needs no conversion.
 */
export interface IForgeCatchUpEvent {
	readonly kind: string;
	readonly repository: string;
	readonly number?: number | undefined;
	readonly change?: string | undefined;
	readonly label?: string | undefined;
	readonly check?: string | undefined;
	readonly conclusion?: string | undefined;
	readonly sha?: string | undefined;
}

/** A pull request a session is subscribed to. */
export interface IForgeCatchUpTarget {
	/** `owner/name`. */
	readonly repository: string;
	readonly number: number;
}

/**
 * A forge's half of the catch-up: one read of the subscribed pull requests,
 * answered as the events that describe what is true of them now (merged,
 * closed, a required check failed, a label that waits on someone). It
 * writes nothing to the forge.
 */
export interface IForgeCatchUpSource {
	readonly missed: (
		targets: readonly IForgeCatchUpTarget[],
	) => Promise<readonly IForgeCatchUpEvent[]>;
}

/** What the host remembers of what it already delivered, per pull request. */
export interface IForgeCatchUpCursor {
	readonly delivered: (
		target: IForgeCatchUpTarget,
	) => Promise<readonly string[]>;
	readonly mark: (target: IForgeCatchUpTarget, key: string) => Promise<void>;
}

export interface IForgeCatchUpInput {
	readonly source: IForgeCatchUpSource;
	readonly cursor: IForgeCatchUpCursor;
	/** The pull requests sessions wait on. */
	readonly targets: () => Promise<readonly IForgeCatchUpTarget[]>;
	/** Tell the sessions: for the host, write the event to the shared store. */
	readonly deliver: (event: IForgeCatchUpEvent) => Promise<void> | void;
}
