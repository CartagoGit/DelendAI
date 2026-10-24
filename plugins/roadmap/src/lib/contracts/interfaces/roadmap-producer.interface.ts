import type { IRoadmapBumpIntent } from './bump-intent.interface';
import type { IRoadmapGateVerdict } from './gate.interface';
import type {
	IRoadmapEntryKind,
	IRoadmapEntryState,
} from './roadmap.interface';

export interface IRoadmapProducerOptions {
	/**
	 * Where the project keeps its roadmap file. It comes from the project's
	 * configuration, and it is also how the producer knows which format to
	 * read the file's text as.
	 */
	readonly roadmapLocator: string;
}

export interface IRoadmapEntryProjection {
	readonly id: string;
	readonly kind: IRoadmapEntryKind;
	readonly state: IRoadmapEntryState;
	readonly gates: IRoadmapGateVerdict;
}

export interface IRoadmapHorizonProjection {
	readonly version: string;
	readonly bump: IRoadmapBumpIntent;
	readonly entries: readonly IRoadmapEntryProjection[];
	readonly counts: {
		readonly total: number;
		readonly delivered: number;
		readonly withdrawn: number;
		readonly open: number;
	};
}

/** What the producer derives: either the horizons, or why it could not. */
export type IRoadmapProjection =
	| { readonly horizons: readonly IRoadmapHorizonProjection[] }
	| { readonly error: string };
