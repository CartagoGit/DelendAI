/**
 * subscription-host.interface.ts — a subscription's own host, and what
 * the subscription invoker needs to run a task there.
 */
import type { IKindInvoker } from '../../invoke/types';

/** How a subscription's host runs one task, and how it is recognised as the current host. */
export interface ISubscriptionHost {
	/** The CLI that runs one task headless, and the arguments before the prompt. */
	readonly cli?: {
		readonly command: string;
		readonly args: readonly string[];
	};
	/** Matches the host's name as the MCP client gives it at the handshake. */
	readonly current: RegExp;
}

export interface ISubscriptionInvokerOptions {
	/** Runs a cli invoke; the subscription hands it its host's CLI. */
	readonly cli?: IKindInvoker | undefined;
	/** The host this server answers, as its client named itself; `undefined` before the handshake. */
	readonly currentHost?: (() => string | undefined) | undefined;
}
