/**
 * What a branch's `{scope}` segment names: the proposal or proposals, the
 * slice or slices, and the generation (f00808 S9).
 */
export interface IWorkRefScope {
	/** One id (`x01003`), or several joined by `+` (`x01004+x01016`). */
	readonly proposal: string;
	/**
	 * `all`, one slice (`S2`), a range (`S1-S3`) or a set (`S1+S4`).
	 */
	readonly slice: string;
	/** 1 unless this is a later attempt; shown from 2 on as `-G{n}`. */
	readonly generation: number;
}
