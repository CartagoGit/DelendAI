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
