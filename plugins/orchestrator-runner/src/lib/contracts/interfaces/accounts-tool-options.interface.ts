/**
 * accounts-tool-options.interface.ts — what `<prefix>_accounts` reads.
 */
import type { IProviderAccount } from '@delendai/core/contracts';

export interface IAccountsToolOptions {
	readonly namespacePrefix: string;
	readonly accounts: readonly IProviderAccount[];
	readonly ledgerPath: string;
	readonly journalPath: string;
}
