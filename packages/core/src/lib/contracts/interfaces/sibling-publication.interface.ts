/** A git runner as the publish step has it: ok, and the trimmed output. */
export type ISiblingPublicationGit = (args: readonly string[]) => {
	readonly ok: boolean;
	readonly out: string;
};

/** What the siblings of a publication ask of the one being published. */
export interface ISiblingVerdict {
	/** Siblings holding commits `tip` lacks: refuse, and say what to merge. */
	readonly lacking: readonly string[];
	/** Siblings `tip` contains completely: retire after the push. */
	readonly contained: readonly string[];
}

/** A step of retiring a superseded publication. */
export interface ISiblingStep {
	readonly name: string;
	readonly ok: boolean;
	readonly detail: string;
}
