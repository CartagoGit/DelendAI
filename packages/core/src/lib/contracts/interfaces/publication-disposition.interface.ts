/**
 * publication-disposition.interface.ts — what the queue decided about a
 * pull request on its last pass.
 */
export interface IPublicationDisposition {
	readonly number: number;
	readonly headRef: string;
	/** `author` is the one nobody but the author moves. */
	readonly disposition: string;
	readonly why: string;
}

export interface IPublicationDispositions {
	readonly at: string;
	readonly dispositions: readonly IPublicationDisposition[];
}
