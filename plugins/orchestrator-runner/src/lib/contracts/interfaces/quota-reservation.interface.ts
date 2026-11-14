/**
 * quota-reservation.interface.ts — what a quota pool holds and what an
 * invocation has set aside from it.
 */

/** One window of a pool. Windows are separate limits, never summed. */
export interface IQuotaGroupWindow {
	readonly window: 'hourly' | 'weekly' | 'monthly';
	/** `requests` windows are counted per invocation; others only need room. */
	readonly unit:
		| 'requests'
		| 'tokens'
		| 'credits'
		| 'usd'
		| 'subscription-usage';
	readonly limit: number | null;
	readonly used: number | null;
	readonly resetAt: string | null;
}

/** A pool's windows as last observed, and when. */
export interface IQuotaGroupObservation {
	readonly observedAt: string;
	readonly windows: readonly IQuotaGroupWindow[];
}

/** An invocation's hold on the pools of its account, until `expiresAt`. */
export interface IQuotaReservation {
	readonly invocationId: string;
	readonly groups: readonly string[];
	readonly expiresAt: string;
}

/** What one group had left when a hop was reserved on it, and from where. */
export interface IQuotaGroupRemaining {
	readonly group: string;
	readonly windows: readonly {
		readonly window: IQuotaGroupWindow['window'];
		readonly unit: IQuotaGroupWindow['unit'];
		readonly left: number;
		/** Read from the vendor, or counted against the person's budget. */
		readonly source: 'observed' | 'budget';
	}[];
}

export type IQuotaReservationOutcome =
	| {
			readonly kind: 'reserved';
			readonly remaining: readonly IQuotaGroupRemaining[];
	  }
	| { readonly kind: 'refused'; readonly reason: string };

/**
 * The hold an invocation takes on its account's pools before it runs:
 * `reserved` with the release to call when it ends, or `refused` and why.
 * An invocation off any account holds nothing (`undefined`).
 */
export type IQuotaHold = (
	providerId: string,
	accountId: string | undefined,
	invocationId: string,
) => Promise<
	| {
			readonly kind: 'reserved';
			readonly release: () => Promise<void>;
			/** What each group had left when the hop was reserved. */
			readonly remaining?: readonly IQuotaGroupRemaining[];
	  }
	| { readonly kind: 'refused'; readonly reason: string }
	| undefined
>;
