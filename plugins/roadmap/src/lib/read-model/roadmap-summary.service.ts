import { ROADMAP_WITHDRAWN_STATES } from '../contracts/constants/roadmap.constant';
import type {
	IRoadmapEntryDetail,
	IRoadmapHorizonSummary,
} from '../contracts/interfaces/read-model.interface';
import type {
	IRoadmap,
	IRoadmapHorizon,
} from '../contracts/interfaces/roadmap.interface';

const isWithdrawn = (state: string): boolean =>
	(ROADMAP_WITHDRAWN_STATES as readonly string[]).includes(state);

const summariseHorizon = (horizon: IRoadmapHorizon): IRoadmapHorizonSummary => {
	const delivered = horizon.entries.filter(
		(entry) => entry.state === 'delivered',
	).length;
	const withdrawn = horizon.entries.filter((entry) =>
		isWithdrawn(entry.state),
	).length;
	return {
		version: horizon.version,
		...(horizon.bumpHint === undefined
			? {}
			: { bumpHint: horizon.bumpHint }),
		counts: {
			total: horizon.entries.length,
			delivered,
			withdrawn,
			open: horizon.entries.length - delivered - withdrawn,
		},
		entries: horizon.entries.map((entry) => ({
			id: entry.id,
			title: entry.title,
			kind: entry.kind,
			state: entry.state,
		})),
	};
};

/**
 * The roadmap as a listing: per horizon its counts and one line per
 * entry. The gates, estimates and notes stay in the file until somebody
 * asks for one entry.
 */
export const summariseRoadmap = (
	roadmap: IRoadmap,
	version?: string,
): readonly IRoadmapHorizonSummary[] =>
	roadmap.horizons
		.filter(
			(horizon) => version === undefined || horizon.version === version,
		)
		.map(summariseHorizon);

/** One entry whole, wherever it is; nothing when no horizon holds it. */
export const entryDetail = (
	roadmap: IRoadmap,
	entryId: string,
): IRoadmapEntryDetail | undefined => {
	for (const horizon of roadmap.horizons) {
		const entry = horizon.entries.find((each) => each.id === entryId);
		if (entry !== undefined) return { version: horizon.version, entry };
	}
	return undefined;
};
