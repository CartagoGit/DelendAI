/**
 * external-answer.interface.ts — an external answer made small, what it
 * matches in the project, and how what came of it holds up.
 */

/** The small facts an agent needs, and where the raw answer is kept. */
export interface INormalizedAnswer {
	/** Scalars by path (`frame.name`), list lengths, and the start of any text. */
	readonly facts: Readonly<Record<string, string | number | boolean>>;
	/** Opens the raw answer, for the rare case the facts do not cover. */
	readonly handle: string;
	readonly rawBytes: number;
	readonly factBytes: number;
}

/** An existing component an external description may already be. */
export interface IReuseCandidate {
	readonly path: string;
	/** 0..1: how many of the description's words the component's name shares. */
	readonly similarity: number;
}

/** A file produced from an external answer, to check against the contract. */
export interface IProducedFile {
	readonly path: string;
	readonly content: string;
}

/** What the external source said that the project may contradict. */
export interface IExternalSourceFacts {
	readonly framework?: { readonly id: string; readonly version: string };
}

/** One way a produced file departs from the project, resolved to the project. */
export interface IContractFinding {
	readonly kind: 'placement' | 'design-token' | 'framework-version';
	readonly path?: string;
	readonly detail: string;
	readonly resolvedTo: 'project';
	/** What the external source wanted, when it wanted something else. */
	readonly overridden?: string;
}
