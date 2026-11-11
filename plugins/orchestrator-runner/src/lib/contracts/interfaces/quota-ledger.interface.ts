/**
 * quota-ledger.interface.ts — the shape of the quota reservation ledger.
 */
import type { IQuotaReservation } from './quota-reservation.interface';

/** A hop that was reserved, kept to count what a declared budget has spent. */
export interface ISpentReservation {
	readonly invocationId: string;
	readonly groups: readonly string[];
	readonly at: string;
}

export interface ILedger {
	readonly reservations: readonly IQuotaReservation[];
	/** Additive: a ledger written before budgets reads as none spent. */
	readonly history: readonly ISpentReservation[];
	/**
	 * Until when nothing may be reserved: a ledger that could not be read
	 * was set aside with whatever it held, and what it held stays unknown
	 * until every reservation in it would have expired.
	 */
	readonly blockedUntil?: string | undefined;
}
