/**
 * account-offer.interface.ts — what offering the accounts found did.
 */
import type { IProviderAccount } from './provider-account.interface';

/** What the flow did, for the caller to report. */
export interface IAccountOfferOutcome {
	/** The person's file the answers went to. */
	readonly personalLayer: string;
	readonly offered: readonly IProviderAccount[];
	readonly added: readonly string[];
	readonly declined: readonly string[];
}
