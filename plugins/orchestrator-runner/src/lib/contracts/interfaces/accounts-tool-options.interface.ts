/**
 * accounts-tool-options.interface.ts — what `<prefix>_accounts` reads.
 */
import type { IProviderAccount } from '@delendai/core/contracts';
import type { IProviderCapabilities } from '@delendai/core/public';

export interface IAccountsToolOptions {
	readonly namespacePrefix: string;
	readonly accounts: readonly IProviderAccount[];
	/** The roster, for the CLI entries that run on the whole environment. */
	readonly providers: readonly IProviderCapabilities[];
	readonly ledgerPath: string;
	readonly journalPath: string;
}
