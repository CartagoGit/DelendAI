/**
 * forge-event-port.interface.ts — what a forge says when something changes,
 * in words no forge owns.
 *
 * An adapter (GitHub first) turns its own deliveries into `IForgeEvent`; a
 * transport carries deliveries to this machine over a connection it opens
 * itself; a subscriber reads events and never a forge's payload. A second
 * forge is a new adapter and transport, and no subscriber changes.
 */

import type {
	FORGE_EVENT_KINDS,
	FORGE_PR_CHANGES,
} from '../constants/forge-event.constant';

export type IForgeEventKind = (typeof FORGE_EVENT_KINDS)[number];
export type IForgePrChange = (typeof FORGE_PR_CHANGES)[number];

/** Who caused the change, and whether it was an automation. */
export interface IForgeEventActor {
	readonly name: string;
	readonly bot: boolean;
}

/** One normalised change on the forge. Every field is forge-neutral. */
export interface IForgeEvent {
	readonly kind: IForgeEventKind;
	/** `owner/name` of the repository it happened in. */
	readonly repository: string;
	/** The pull request or issue number, when the event is about one. */
	readonly number?: number | undefined;
	/** `branch.pushed`: the branch pushed; a pull request: its head branch. */
	readonly branch?: string | undefined;
	/** A pull request's base branch. */
	readonly base?: string | undefined;
	/** The commit the event is about: the pushed tip, a head, a checked commit. */
	readonly sha?: string | undefined;
	/** `pr.updated` and `issue.updated`: what changed. */
	readonly change?: IForgePrChange | undefined;
	/** The label added or removed, when `change` is about a label. */
	readonly label?: string | undefined;
	/** The labels it carries after the change. */
	readonly labels?: readonly string[] | undefined;
	readonly actor?: IForgeEventActor | undefined;
	/** `check.completed`: the check's name and conclusion. */
	readonly check?: string | undefined;
	readonly conclusion?: string | undefined;
	/** `review.submitted`: the review's state. */
	readonly review?: string | undefined;
	/** `pr.commented`: the comment's text, as written. */
	readonly comment?: string | undefined;
}

/** One delivery as a transport received it: headers and the raw body. */
export interface IForgeEventDelivery {
	/** Header names in lower case. */
	readonly headers: Readonly<Record<string, string>>;
	/** The raw body: a signature is computed over these exact bytes. */
	readonly body: string;
}

/** What an adapter made of one delivery: events, or why it made none. */
export type IForgeEventMapping =
	| { readonly events: readonly IForgeEvent[] }
	| { readonly dropped: string };

/** A forge's half of the port: signatures, names and payload mapping. */
export interface IForgeEventAdapter {
	/** The forge it reads, for reports only. */
	readonly forge: string;
	/** Whether `delivery` was signed with `secret`. Constant-time. */
	readonly verify: (delivery: IForgeEventDelivery, secret: string) => boolean;
	/** The forge's event name for this delivery, read from its headers. */
	readonly eventName: (delivery: IForgeEventDelivery) => string | undefined;
	/** Map a parsed payload of event `name`. Never needs to throw. */
	readonly map: (name: string, payload: unknown) => IForgeEventMapping;
}

/** Counted reasons a delivery produced no event. */
export type IForgeEventDrops = Readonly<Record<string, number>>;

/** Turns deliveries into events and counts what it dropped. */
export interface IForgeEventNormaliser {
	readonly normalise: (
		delivery: IForgeEventDelivery,
	) => readonly IForgeEvent[];
	/** Count one drop decided outside the normaliser (a refused signature). */
	readonly count: (reason: string) => void;
	readonly drops: () => IForgeEventDrops;
}

/** The time a connection was down, for the one question asked about it. */
export interface IForgeEventGap {
	/** When the connection dropped; absent for the first connection. */
	readonly from?: number | undefined;
	readonly to: number;
}

/** One subscriber. Only `onEvent` is required. */
export interface IForgeEventSubscriber {
	readonly onEvent: (event: IForgeEvent) => void;
	/**
	 * Called once each time a connection comes up, to ask the forge once
	 * for what changed while none was: never on a timer.
	 */
	readonly onGap?:
		| ((gap: IForgeEventGap) => Promise<void> | void)
		| undefined;
	/** Told when the connection goes up or down. */
	readonly onConnection?: ((up: boolean) => void) | undefined;
}

/** The port every subscriber uses, whatever forge feeds it. */
export interface IForgeEventPort {
	/** Subscribe; the returned function unsubscribes. */
	readonly subscribe: (subscriber: IForgeEventSubscriber) => () => void;
	/** Whether events can arrive now. */
	readonly connected: () => boolean;
}

/** Callbacks a transport reports through while its connection is open. */
export interface IForgeEventTransportHandlers {
	readonly onDelivery: (delivery: IForgeEventDelivery) => void;
	/** The connection ended; `reason` is fit for a log line, never a secret. */
	readonly onClosed: (reason: string) => void;
}

/** An open connection. */
export interface IForgeEventConnection {
	readonly close: () => Promise<void>;
}

/**
 * A connection this machine opens OUT to the forge, so no inbound port or
 * public address is needed. `open` resolves once deliveries can arrive and
 * rejects when the connection could not be made.
 */
export interface IForgeEventTransport {
	readonly open: (
		input: { readonly secret: string } & IForgeEventTransportHandlers,
	) => Promise<IForgeEventConnection>;
}

/** Cancel a scheduled call. */
export type IForgeEventCancel = () => void;

/** Run `run` once after `delayMs`; tests pass a fake. */
export type IForgeEventDelay = (
	run: () => void,
	delayMs: number,
) => IForgeEventCancel;

/** How the receiver retries a connection that dropped or never opened. */
export interface IForgeEventRetry {
	readonly firstDelayMs: number;
	readonly maxDelayMs: number;
	/** Consecutive failures after which it stops and stays disconnected. */
	readonly maxAttempts: number;
	/** A connection open this long counts as healthy and resets the count. */
	readonly stableMs: number;
}

export interface IForgeEventReceiverInput {
	readonly transport: IForgeEventTransport;
	readonly adapter: IForgeEventAdapter;
	/** Draws the per-connection secret; random by default. */
	readonly secret?: (() => string) | undefined;
	readonly delay?: IForgeEventDelay | undefined;
	readonly now?: (() => number) | undefined;
	readonly retry?: Partial<IForgeEventRetry> | undefined;
	/** One line per thing an operator should know; never carries the secret. */
	readonly report?: ((line: string) => void) | undefined;
}

/** The receiver: the port, plus the switch its owner holds. */
export interface IForgeEventReceiver extends IForgeEventPort {
	/** Open the connection; a no-op while started. */
	readonly start: () => void;
	/** Close it and stop retrying. */
	readonly stop: () => Promise<void>;
	readonly drops: () => IForgeEventDrops;
}
