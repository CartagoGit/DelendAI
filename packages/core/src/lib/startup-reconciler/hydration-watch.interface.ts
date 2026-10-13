/**
 * Contract shapes for `./hydration-watch`.
 *
 * Split out of the implementation so the repo's "types live in
 * contracts" convention holds.
 */

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IStartupFinding } from './contracts';
import type { IStartupClock, IStartupGitSeam } from './seams.interface';

/** What one pass looked at, and what it did about it. */
export interface IHydrationTick {
	readonly ranAt: number;
	readonly findings: readonly IStartupFinding[];
	/** True only when the working tree actually moved. */
	readonly hydrated: boolean;
	/**
	 * Why this pass did nothing, when it did nothing.
	 *
	 * Present is not failure: a checkout sitting on a feature branch is
	 * a perfectly good reason to leave it alone, and saying so beats a
	 * silent no-op that reads identically to a broken timer.
	 */
	readonly skipped?: string | undefined;
}

/**
 * How the watch schedules itself. Injected so a spec can run a year of
 * ticks in a millisecond, and so a host that already owns an event loop
 * can drive it from there instead of a second timer.
 *
 * Returns the function that cancels it.
 */
export type IHydrationSchedule = (
	run: () => void,
	everyMs: number,
) => () => void;

export interface IHydrationWatchInput {
	readonly git: IStartupGitSeam;
	readonly policy: IResolvedDevelopmentPolicy;
	/** How often to look. */
	readonly intervalMs: number;
	readonly clock: IStartupClock;
	/** Every pass is reported, including the ones that did nothing. */
	readonly onTick: (tick: IHydrationTick) => void;
	readonly schedule?: IHydrationSchedule | undefined;
}

/** A running watch. Stopping it is idempotent. */
export interface IHydrationWatch {
	stop(): void;
}
