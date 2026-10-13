/**
 * provider-roster.interface.ts — the root provider roster after validation.
 */
import type { IProviderCapabilities } from './provider-capabilities.interface';

export interface IProviderRoster {
	/** The entries that validate, in their declared order. */
	readonly providers: readonly IProviderCapabilities[];
	/** The entries left out, and why. */
	readonly rejected: readonly {
		readonly index: number;
		readonly id?: string;
		readonly reason: string;
	}[];
}
