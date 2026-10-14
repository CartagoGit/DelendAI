/** What a work ref's subject identifies, once read back. */

/** The parts of a work ref's subject, as its template names them. */
export interface IWorkRefParts {
	/** The kind of work (f00644); derived for a ref that predates it. */
	readonly kind: string;
	/** The proposal the work belongs to. */
	readonly proposal: string;
	/** The slice within it. */
	readonly slice: string;
	/** Its generation counter, as written. */
	readonly generation: string;
	/** What the rest of the name says the work is about. */
	readonly topic: string;
}
