/** Contract shapes for `./start-checkout-hydration`. */

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IHydrationSchedule } from '../startup-reconciler/hydration-watch.interface';

export interface IStartCheckoutHydrationInput {
	/** How this host runs git. The seam is assembled here, not by the host. */
	readonly run: IGitRunner;
	readonly policy: IResolvedDevelopmentPolicy;
	/** Omit for the default cadence; the host decides `off` by not calling. */
	readonly intervalMs?: number | undefined;
	/**
	 * Who triggers a pass. Omit for a timer every `intervalMs`; a host that
	 * hears the forge passes one it can also run on an event, and can stop
	 * the timer while events arrive.
	 */
	readonly schedule?: IHydrationSchedule | undefined;
	/**
	 * Called only when the tree actually moved, with a sentence fit to
	 * show an operator. Passes that did nothing are not reported here:
	 * a host's log is not a heartbeat monitor.
	 */
	readonly onHydrated: (message: string) => void;
	/** Why this process must not move the checkout now; see the watch. */
	readonly standDown?: (() => Promise<string | undefined>) | undefined;
	/**
	 * The clone whose finished units end after every pass that ran under
	 * the lease and fetched. Omit and nothing ends here.
	 */
	readonly root?: string | undefined;
	/** Called when a pass ended units, with a sentence for the operator. */
	readonly onUnitsEnded?: ((message: string) => void) | undefined;
}
