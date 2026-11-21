export interface IComputeSlotRequest<T> {
	readonly lockPath: string;
	/** Who asks and for what, shown to everyone waiting behind it. */
	readonly label: string;
	readonly run: () => Promise<T> | T;
	/** Where waiting and turn notices go. Default: standard error. */
	readonly notify?: (message: string) => void;
	/**
	 * Why this turn is urgent (a repair of a red integration branch, or a
	 * stated reason): it takes the slot next, ahead of every waiting normal
	 * caller, and never interrupts a proof already running. One urgent turn
	 * runs at a time; the rest queue in order. Recorded with the holder.
	 */
	readonly urgent?: string;
	readonly timeoutMs?: number;
	readonly staleMs?: number;
	readonly waitNoticeMs?: number;
	/** With `tip`: the unit asking, so its waiting turns are not duplicated. */
	readonly unit?: string;
	/** The commit being proved: same unit and tip join one wait. */
	readonly tip?: string;
}

/** One urgent caller in the lane: who, why, and since when. */
export interface IUrgentTicket {
	readonly label: string;
	readonly pid: number;
	readonly reason: string;
	readonly at: string;
}
