/**
 * acp.interface.ts — driving any agent through the Agent Client Protocol:
 * how it is started, what it is asked, and what it said about itself.
 */

/** How an agent process is started. */
export interface IAcpLaunch {
	readonly command: string;
	readonly args: readonly string[];
	readonly env?: Readonly<Record<string, string>> | undefined;
}

/** One choice an agent offers when it asks before acting. */
export interface IAcpPermissionOption {
	readonly id: string;
	readonly name: string;
	readonly kind:
		| 'allow_once'
		| 'allow_always'
		| 'reject_once'
		| 'reject_always';
}

/** What the agent wants to do, and the choices it offers. */
export interface IAcpPermissionAsk {
	readonly title: string;
	readonly options: readonly IAcpPermissionOption[];
}

/** The option chosen, or `cancel` to stop the turn. */
export type IAcpPermissionDecision = { readonly optionId: string } | 'cancel';

export interface IAcpPromptInput {
	readonly cwd: string;
	readonly prompt: string;
	/** Answers a permission request; absent, every request is refused. */
	readonly decide?:
		| ((ask: IAcpPermissionAsk) => Promise<IAcpPermissionDecision>)
		| undefined;
	/** The agent's text as it streams. */
	readonly onText?: ((chunk: string) => void) | undefined;
	/** An auth method to use when the agent offers several. */
	readonly authMethodId?: string | undefined;
}

/** What one prompt turn said and cost, and what the agent says it is. */
export interface IAcpPromptResult {
	readonly agent: {
		readonly name?: string | undefined;
		readonly version?: string | undefined;
	};
	readonly protocolVersion: number;
	readonly authMethods: readonly string[];
	readonly modes: readonly string[];
	readonly stopReason: string;
	readonly text: string;
	readonly usage?:
		| {
				readonly inputTokens: number;
				readonly outputTokens: number;
				readonly totalTokens: number;
		  }
		| undefined;
}

/** What an agent says about itself when greeted, before any prompt costs anything. */
export type IAcpIntroduction = Pick<
	IAcpPromptResult,
	'agent' | 'protocolVersion' | 'authMethods'
> & {
	readonly loadSession: boolean;
	readonly promptCapabilities: readonly string[];
};
