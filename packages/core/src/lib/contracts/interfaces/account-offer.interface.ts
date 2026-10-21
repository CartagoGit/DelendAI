/**
 * account-offer.interface.ts — what offering the accounts found did.
 */
import type { IAccountFinding } from './account-finding.interface';
import type { IProviderAccount } from './provider-account.interface';

/** What the flow did, for the caller to report. */
export interface IAccountOfferOutcome {
	/** The person's file the answers went to. */
	readonly personalLayer: string;
	readonly offered: readonly IProviderAccount[];
	readonly added: readonly string[];
	readonly declined: readonly string[];
	/** Findings nobody classified yet (no one was there to answer). */
	readonly unclassified: readonly Pick<
		IAccountFinding,
		'key' | 'displayName' | 'evidence' | 'vendorHint'
	>[];
}

/** The steps an offer goes through, named so each caller says them in its own words. */
export type IOfferStep =
	| 'clients'
	| 'sources'
	| 'sources-and-catalogue'
	| 'names';

/** Where a question stands in its run: the third of thirteen. */
export interface IOfferPosition {
	readonly index: number;
	readonly total: number;
	/** The finding behind an offer, when there is one. */
	readonly finding?: IAccountFinding | undefined;
}

/** What is already declared or declined, which no offer repeats. */
export interface IKnownAccounts {
	readonly accounts: readonly {
		readonly accountId: string;
		readonly vendor: string;
		readonly credentialMode: IProviderAccount['credentialMode'];
		readonly credentialEnv?: string | undefined;
	}[];
	readonly declined: readonly string[];
}
