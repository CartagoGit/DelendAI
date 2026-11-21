/**
 * recent-edit-filter.interface.ts
 *
 * Shapes for the quiet-period filter that keeps an edit still being typed
 * out of an automatic commit. Behaviour lives in
 * `lib/services/recent-edit-filter.ts`.
 */

export interface IRecentEditFilterResult {
	readonly files: readonly string[];
	/** Withheld paths, each with how long ago it was touched (ms). */
	readonly withheld: ReadonlyArray<{
		readonly file: string;
		readonly ageMs: number;
	}>;
}

/** Reads a file's last-modified time, or `undefined` if it cannot. */
export type IModifiedAtReader = (
	file: string,
) => Promise<number | undefined> | number | undefined;
