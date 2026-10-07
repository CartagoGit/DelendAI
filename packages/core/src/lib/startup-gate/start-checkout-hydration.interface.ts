/** Contract shapes for `./start-checkout-hydration`. */

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

export interface IStartCheckoutHydrationInput {
	/** How this host runs git. The seam is assembled here, not by the host. */
	readonly run: IGitRunner;
	readonly policy: IResolvedDevelopmentPolicy;
	/** Omit for the default cadence; the host decides `off` by not calling. */
	readonly intervalMs?: number | undefined;
	/**
	 * Called only when the tree actually moved, with a sentence fit to
	 * show an operator. Passes that did nothing are not reported here:
	 * a host's log is not a heartbeat monitor.
	 */
	readonly onHydrated: (message: string) => void;
}
