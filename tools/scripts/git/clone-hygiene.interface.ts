/**
 * Shapes for `./clone-hygiene.script`.
 */

/** One git config line this repository asks every clone to carry. */
export interface ICloneSetting {
	/** The git config key, applied at `--local` scope only. */
	readonly key: string;
	/** The value this repository requires. */
	readonly value: string;
	/** The failure it prevents, in one sentence. */
	readonly because: string;
}
