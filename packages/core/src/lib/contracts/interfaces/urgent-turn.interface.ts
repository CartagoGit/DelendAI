/** The conclusion of the integration branch's latest finished certification. */
export type ICertificationLookup = (
	integration: string,
) => Promise<string | undefined>;

export interface IUrgentTurnRequest {
	readonly root: string;
	readonly args: readonly string[];
	readonly proposal: string | undefined;
	readonly integration: string;
	/** Override for specs: the certification's conclusion. */
	readonly certification?: ICertificationLookup;
}
