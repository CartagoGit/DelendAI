/** What the queue needs to know about one candidate to order it. */
export interface IQueueCandidateFacts {
	readonly number: number;
	/** The candidate's branch, without `refs/heads/`. */
	readonly headRef: string;
	readonly draft: boolean;
	/** A required or other check concluded badly on its head. */
	readonly red: boolean;
	/** The forge reports conflicts with the integration branch. */
	readonly conflicting: boolean;
}
