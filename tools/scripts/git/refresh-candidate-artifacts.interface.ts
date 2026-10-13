/** What refreshing one candidate did, or could not do. */
export interface ICandidateRefresh {
	readonly candidate: string;
	readonly state: 'refreshed' | 'conflicted' | 'failed';
	/** Why, in words whoever owns the candidate can act on. */
	readonly detail: string;
}
