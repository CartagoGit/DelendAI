/**
 * personal-addition.interface.ts — what is added to a person's project
 * file, and what of it was new.
 */
/** What a caller adds; entries the file already holds are kept as they are. */
export interface IPersonalAddition {
	readonly accounts?: readonly Readonly<Record<string, unknown>>[];
	readonly providers?: readonly {
		readonly id: string;
		readonly accountId: string;
	}[];
	readonly declinedOffers?: readonly string[];
	/** Agents to declare; one the file already holds by id is kept as it is. */
	readonly agents?: readonly Readonly<Record<string, unknown>>[];
}

/** How many entries of each kind were new. */
export interface IPersonalMerge {
	readonly accounts: number;
	readonly providers: number;
	readonly declinedOffers: number;
	readonly agents: number;
}
