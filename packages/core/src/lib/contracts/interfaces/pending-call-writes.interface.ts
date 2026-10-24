/**
 * pending-call-writes.interface.ts — a tool's writes whose commit failed,
 * kept so whoever commits them later commits them as the tool's.
 */

export interface IPendingCallWrite {
	/** The subject the tool's own commit would have carried. */
	readonly subject: string;
	/** Each path the call changed, with its state as the call left it. */
	readonly paths: Readonly<Record<string, string>>;
}
