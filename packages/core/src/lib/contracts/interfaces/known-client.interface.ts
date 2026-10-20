import type {
	IBillingMode,
	ICredentialMode,
} from './provider-account.interface';

/** How a missing client is installed; a piped-to-shell installer is flagged. */
export interface IKnownClientInstall {
	readonly tool: string;
	readonly args: readonly string[];
	readonly pipeTo?: 'sh' | undefined;
	readonly dangerous: boolean;
	readonly caveat: string;
}

/**
 * A vendor client delendai knows: how to find it, install it, and ask it
 * whether it is logged in. Never a credential, never a configuration value.
 */
export interface IKnownClient {
	/** The command it runs as, and the key every consumer uses for it. */
	readonly command: string;
	/** The id discovery reports it under (`claude-cli`). */
	readonly id: string;
	readonly label: string;
	readonly vendor: string;
	/** First-pass weight of its default model, 1 (cheap) to 5. */
	readonly costTier: 1 | 2 | 3 | 4 | 5;
	readonly install: IKnownClientInstall;
	/** Arguments that print whether it is logged in, when it has them. */
	readonly loginStatusArgs?: readonly string[] | undefined;
	/** The variable it reads its profile directory from, when it has one. */
	readonly profileVariable?: string | undefined;
	/** Flags that make it ignore a subscription login. */
	readonly loginDiscardingFlags?: readonly string[] | undefined;
	/**
	 * Arguments that print the models it can reach, one `provider/model`
	 * per line, for a client that hosts several (OpenCode).
	 */
	readonly modelListArgs?: readonly string[] | undefined;
	/**
	 * How a delegated hop is told which tools it may use, when the client
	 * can be: `restrict` names the flag that limits the tools that exist
	 * in its context (what it pays for on every hop), `approve` the one
	 * that pre-approves them for a run nobody answers prompts in.
	 */
	readonly toolScope?:
		| { readonly restrict: string; readonly approve?: string | undefined }
		| undefined;
	/** Flags that leave out what a hop scoped to its tools never uses. */
	readonly scopedHopArgs?: readonly string[] | undefined;
	/** Flags that load no MCP server, for a scoped hop whose tools name none. */
	readonly noMcpArgs?: readonly string[] | undefined;
	/** How the client names a tool an MCP server provides (`mcp__`). */
	readonly mcpToolPrefix?: string | undefined;
	/**
	 * What a login-status answer says about how the person is logged in,
	 * first match wins: a subscription login and an API key bill
	 * differently, and an account offered from a guess would mislead.
	 */
	readonly loginKinds?: readonly IClientLoginKind[] | undefined;
}

/** One way a client can be logged in, recognised in its status answer. */
export interface IClientLoginKind {
	/** A regular expression source, matched case-insensitively. */
	readonly pattern: string;
	readonly credentialMode: ICredentialMode;
	readonly billingMode: IBillingMode;
}

/** Whether a client can do work now, as far as it says. */
export type IClientVerdict =
	| 'usable'
	| 'needs-login'
	| 'needs-plan'
	| 'quota-exhausted'
	| 'not-installed'
	| 'unknown';

/** Runs a trusted shell command line (catalogue values only). */
export type IClientCommandRunner = (
	command: string,
	options: { readonly cwd: string; readonly timeoutMs?: number },
) => Promise<{ readonly code: number; readonly output: string }>;

/** What discovery learned about one client, and from which answer. */
export interface IClientDiscovery {
	readonly client: IKnownClient;
	readonly installed: boolean;
	readonly path: string | null;
	readonly version: string | null;
	readonly verdict: IClientVerdict;
	/** The command that decided the verdict and the line of its answer. */
	readonly evidence: {
		readonly command: string;
		readonly line: string;
	} | null;
	/** How it is logged in, when its answer says so (`loginKinds`). */
	readonly login?:
		| Pick<IClientLoginKind, 'credentialMode' | 'billingMode'>
		| undefined;
}

/** The models a host client says it can reach, grouped by provider. */
export interface IClientModels {
	readonly listed: boolean;
	readonly providers: readonly {
		readonly provider: string;
		readonly models: readonly string[];
	}[];
	/** Why nothing was listed, when nothing was. */
	readonly reason?: string | undefined;
}
