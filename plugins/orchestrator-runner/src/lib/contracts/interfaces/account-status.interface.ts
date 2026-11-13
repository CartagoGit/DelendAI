/**
 * account-status.interface.ts — one account as the `accounts` tool shows
 * it: what it is, never a secret.
 */
import type { IInvocationState } from './invocation-journal.interface';

export interface IAccountStatus {
	readonly accountId: string;
	readonly vendor: string;
	readonly displayName?: string;
	readonly credentialMode: string;
	readonly billingMode: string;
	/** The NAME of the variable holding its credential, when it has one. */
	readonly credentialEnv?: string;
	/** Whether its client runs in an isolated profile directory. */
	readonly isolated: boolean;
	readonly permittedAutomation: boolean;
	/** Each pool and the invocations holding it now; `null` when unknown. */
	readonly quotaGroups: readonly {
		readonly group: string;
		readonly held: number | null;
	}[];
	/** The latest hop the journal records on it. */
	readonly lastInvocation?: {
		readonly state: IInvocationState;
		readonly at: string;
		readonly providerId: string;
	};
}
