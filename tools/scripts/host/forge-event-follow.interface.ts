/** Contract shapes for `./forge-event-follow.service`. */

import type { IForgeEventReceiver } from '@delendai/forge/public';

/** What a forge event asks of this host. */
export type IForgeEventFollowAction = 'follow' | 'event';

/** What the router needs to know about this workspace. */
export interface IForgeEventFollowScope {
	/** `owner/name`: events of other repositories are not ours. */
	readonly repository: string;
	readonly integrationBranch: string;
	/** The label `land` puts on a pull request that must be brought forward. */
	readonly needsUpdateLabel: string;
}

/** Arms and disarms a recurring call; the fallback timer of the follow. */
export interface IFallbackTimer {
	readonly arm: () => void;
	readonly disarm: () => void;
	readonly armed: () => boolean;
}

/** A schedule the hydration watch takes, run now by events, by a timer otherwise. */
export interface ISwitchableSchedule extends IFallbackTimer {
	/** The schedule handed to the watch. */
	readonly schedule: (run: () => void, everyMs: number) => () => void;
	/** Run one pass now; a no-op before the watch registered. */
	readonly runNow: () => void;
}

/** Starts a recurring call and returns its cancel; tests pass a fake. */
export type IRecurring = (run: () => void, everyMs: number) => () => void;

export interface IForgeEventFollowInput {
	readonly receiver: IForgeEventReceiver;
	readonly scope: IForgeEventFollowScope;
	/** One follow pass now: fetch, fast-forward, and `--on=move` if it moved. */
	readonly follow: () => void;
	/** The follow-ups of a forge event (`--on=event`). */
	readonly followUp: () => void;
	readonly fallback: IFallbackTimer;
	/** Why this server must not maintain the workspace, or `undefined`. */
	readonly standDown: () => Promise<string | undefined>;
	readonly report: (line: string) => void;
}

/** A running follow. */
export interface IForgeEventFollow {
	/** Ask again whether this server holds the lease, and start or stop receiving. */
	readonly reconsider: () => Promise<void>;
	readonly stop: () => Promise<void>;
}
