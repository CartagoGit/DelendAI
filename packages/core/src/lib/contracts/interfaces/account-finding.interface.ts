/**
 * account-finding.interface.ts — something on the machine that suggests an
 * account, and how it is paid when the source can say.
 */
import type { IClientLoginKind } from './known-client.interface';
import type {
	IBillingMode,
	ICredentialMode,
} from './provider-account.interface';

/** Where a finding came from. None of them names a vendor list. */
export type IAccountSource =
	| 'client-login'
	| 'client-provider'
	| 'credential-variable'
	| 'seen-models'
	| 'plan-tool'
	| 'local-endpoint';

/** Who the account is with and how it is paid: what an offer needs. */
export interface IAccountClassification {
	readonly vendor: string;
	readonly credentialMode: ICredentialMode;
	readonly billingMode: IBillingMode;
}

/** One finding. It never carries a credential's value. */
export interface IAccountFinding {
	/** Stable across runs: a learned answer is kept under it. */
	readonly key: string;
	readonly source: IAccountSource;
	/** The account id it would be offered as. */
	readonly accountId: string;
	readonly displayName: string;
	/** What the source suggests the vendor is; never checked against a list. */
	readonly vendorHint: string;
	/** Present when the source itself says who and how it is paid. */
	readonly classification?: IAccountClassification | undefined;
	/** The variable holding the credential, for a credential-variable finding. */
	readonly credentialEnv?: string | undefined;
	readonly models: readonly string[];
	/** What was seen, in a line a person can check. */
	readonly evidence: string;
}

/** A vendor tool that holds a plan login (not a coding client). */
export interface IPlanTool {
	readonly command: string;
	readonly vendor: string;
	readonly label: string;
	readonly loginStatusArgs: readonly string[];
	readonly loginKinds: readonly IClientLoginKind[];
	/** How it says what is left of the plan, when it can. */
	readonly quota?:
		| { readonly args: readonly string[]; readonly format: string }
		| undefined;
}

/** A local server that answers the OpenAI-compatible model list. */
export interface ILocalModelEndpoint {
	readonly name: string;
	readonly port: number;
}

/** What a fetch of a local endpoint answers; injected so specs need no server. */
export type ILocalFetch = (
	url: string,
	timeoutMs: number,
) => Promise<{ readonly ok: boolean; readonly json: unknown } | undefined>;
