export interface IComputeSlotRequest<T> {
	readonly lockPath: string;
	/** Who asks and for what, shown to everyone waiting behind it. */
	readonly label: string;
	readonly run: () => Promise<T> | T;
	/** Where waiting and turn notices go. Default: standard error. */
	readonly notify?: (message: string) => void;
	readonly timeoutMs?: number;
	readonly staleMs?: number;
	readonly waitNoticeMs?: number;
	/** With `tip`: the unit asking, so its waiting turns are not duplicated. */
	readonly unit?: string;
	/** The commit being proved: same unit and tip join one wait. */
	readonly tip?: string;
}
