/**
 * provider-roster.interface.ts — the root provider roster and its
 * accounts after validation.
 */
import type { IProviderAccount } from './provider-account.interface';
import type { IProviderCapabilities } from './provider-capabilities.interface';

/** One entry left out, the block it was declared in, and why. */
export interface IRosterRejection {
	readonly block: 'accounts' | 'providers';
	readonly index: number;
	readonly id?: string;
	readonly reason: string;
}

export interface IProviderRoster {
	/** The entries that validate, in their declared order. */
	readonly providers: readonly IProviderCapabilities[];
	/** The accounts that validate, in their declared order. */
	readonly accounts: readonly IProviderAccount[];
	/** The entries left out, and why. */
	readonly rejected: readonly IRosterRejection[];
}
