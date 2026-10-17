/**
 * provider-account.interface.ts — one account a provider is reached
 * through. Roster entries name it by `accountId`, so two accounts of the
 * same vendor, and several models on one account, stay apart: what an
 * account consumes is counted against its own quota groups only.
 *
 * An account never holds a secret. `credentialEnv` is the NAME of the
 * variable that holds one, and `profileDir` is the directory the vendor's
 * own client keeps that account's login in.
 */
import type {
	BILLING_MODES,
	CREDENTIAL_MODES,
} from '../constants/provider-account-modes.constant';

export type CredentialMode = (typeof CREDENTIAL_MODES)[number];
export type BillingMode = (typeof BILLING_MODES)[number];

export interface IProviderAccount {
	/** Unique kebab-case id the roster entries refer to. */
	readonly accountId: string;
	/** The vendor the account belongs to (`anthropic`, `openai`, …). */
	readonly vendor: string;
	/** A label for people; never inferred from a login or a token. */
	readonly displayName?: string;
	readonly credentialMode: CredentialMode;
	readonly billingMode: BillingMode;
	/** Name of the environment variable holding the credential. */
	readonly credentialEnv?: string;
	/** The isolated profile directory the vendor's client logs in to. */
	readonly profileDir?: string;
	/**
	 * The quota pools this account draws from. A pool belongs to one
	 * account: windows of the same account are separate pools, never sums.
	 */
	readonly quotaGroups: readonly string[];
	/** Whether unattended work may run on this account. Off unless said. */
	readonly permittedAutomation: boolean;
}
