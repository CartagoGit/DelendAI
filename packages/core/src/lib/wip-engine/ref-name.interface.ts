/**
 * Contract shapes for `./ref-name`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `ref-name.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `ref-name.ts`, so no import site changes.
 */

/** Values a work-ref template may interpolate. */
export interface IWorkRefVariables {
	readonly agent: string;
	readonly proposal: string;
	readonly slice: string;
	readonly generation: number | string;
}
