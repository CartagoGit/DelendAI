/**
 * webhook-forward.interface.ts — the seams of the `gh webhook forward`
 * transport: a child process and a loopback listener, both replaceable in
 * tests.
 */

import type {
	IForgeEventDelay,
	IForgeEventDelivery,
} from '@delendai/forge/public';

/** The part of a child process the transport reads. */
export interface IForwardChild {
	readonly onOutput: (listener: (chunk: string) => void) => void;
	readonly onExit: (listener: (code: number | null) => void) => void;
	readonly kill: () => void;
}

/** Starts `gh` with `args`. */
export type IForwardSpawn = (args: readonly string[]) => IForwardChild;

/** A listener on a loopback port that hands each POST to `onDelivery`. */
export interface IForwardListener {
	readonly port: number;
	readonly close: () => Promise<void>;
}

export type IForwardListen = (
	onDelivery: (delivery: IForgeEventDelivery) => void,
) => Promise<IForwardListener>;

export interface IGhWebhookForwardInput {
	/** `owner/name` of the repository whose events are forwarded. */
	readonly repository: string;
	readonly spawn?: IForwardSpawn | undefined;
	readonly listen?: IForwardListen | undefined;
	readonly delay?: IForgeEventDelay | undefined;
}
