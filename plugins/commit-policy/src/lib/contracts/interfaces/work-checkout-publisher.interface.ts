import type {
	IGitRunner,
	IResolvedDevelopmentPolicy,
} from '@delendai/core/public';

/** What one tick did with one agent's work checkout. */
export interface IWorkCheckoutPublication {
	readonly ref: string;
	/**
	 * `published`: the remote now holds the checkout's commits.
	 * `level`: it already did. `skipped`: nothing was pushed, and `reason`
	 * says why.
	 */
	readonly outcome: 'published' | 'level' | 'skipped';
	readonly reason?: string;
}

export interface IWorkCheckoutPublisherOptions {
	readonly run: IGitRunner;
	readonly policy: IResolvedDevelopmentPolicy;
	/** The durability remote the plugin was configured with, if any. */
	readonly remote?: string | undefined;
	/**
	 * Why this server must not push now, or `undefined`. The host answers
	 * it (`runtimeBehindCheckout`) while the server runs older code than
	 * its checkout: on 2026-09-27 a server started the day before kept
	 * pushing a work ref CI removed every few minutes, because the fix that
	 * recognises delivered work (x00691) had merged after it started.
	 */
	readonly standDown?: () => Promise<string | undefined>;
	/** Told about every tick that did something other than stay level. */
	readonly report?: (
		publications: readonly IWorkCheckoutPublication[],
	) => void;
}

export interface IWorkCheckoutPublisher {
	/** Run one tick now; the timer calls the same function. */
	tick(): Promise<readonly IWorkCheckoutPublication[]>;
	stop(): void;
}
