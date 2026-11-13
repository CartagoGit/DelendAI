/**
 * Contract shapes for `./host-docs-landing.script`.
 */

/** A host document to scan, already read. */
export interface IHostDoc {
	readonly path: string;
	readonly text: string;
}

/** One line of a host document that names a landing route. */
export interface ILandingClaim {
	readonly path: string;
	readonly line: number;
	readonly names: string;
	readonly text: string;
}
