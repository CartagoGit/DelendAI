/** A bounded wait for a detached publication, with no real timer in specs. */
export interface IRemotePublicationWait {
	readonly attempts: number;
	readonly pauseMs: number;
}
