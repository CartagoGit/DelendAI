import type { IRoadmapHorizonDelta } from './read-model.interface';
import type {
	IRoadmapEntrySummary,
	IRoadmapHorizonSummary,
} from './read-model.interface';
import type { IRoadmapEstimate } from './roadmap.interface';

/** One entry as a page shows it: the listing line, plus its date if it has one. */
export interface IRoadmapDisplayEntry extends IRoadmapEntrySummary {
	readonly estimate?: IRoadmapEstimate | undefined;
}

export interface IRoadmapDisplayHorizon
	extends Omit<IRoadmapHorizonSummary, 'entries'> {
	readonly entries: readonly IRoadmapDisplayEntry[];
	readonly declared: readonly string[];
	readonly delivered: readonly string[];
	readonly bump: IRoadmapHorizonDelta['bump'];
}

/**
 * What a page or an editor view shows of a roadmap. A function of the
 * authority file alone — no evidence, no clock, nothing that moves when
 * the file does not — so that a committed copy can be compared with a
 * fresh one byte for byte.
 */
export interface IRoadmapDisplayProjection {
	/** The authority file, relative to the workspace; `null` when none is declared. */
	readonly file: string | null;
	readonly horizons: readonly IRoadmapDisplayHorizon[];
}
