/**
 * forge-event-store.interface.ts — the shapes of the shared forge event
 * store: what is subscribed, and the part of an event core reads. The full
 * event shape belongs to the forge plugin's port; core stores it as given.
 */

/** A session's interest in one pull request or issue. */
export interface IForgeEventSubscription {
	/** The agent the notification is for, as `DELENDAI_AGENT_ID` names it. */
	readonly agent: string;
	/** `owner/name`. */
	readonly repository: string;
	readonly number: number;
	/** Milliseconds since the epoch when it was made. */
	readonly since: number;
}

/** The part of a forge event the store needs to know. */
export interface IForgeEventRecordEvent {
	readonly kind: string;
	readonly repository: string;
	readonly number?: number | undefined;
}

/** One stored event: when it was written, and the event as received. */
export interface IForgeEventRecord {
	readonly at: number;
	readonly event: unknown;
}

/** A pull request named by its web address. */
export interface IForgePullRequestAddress {
	readonly repository: string;
	readonly number: number;
}
