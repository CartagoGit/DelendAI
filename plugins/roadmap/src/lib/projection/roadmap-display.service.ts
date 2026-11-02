import { buildBumpIntent } from '../bump/roadmap-bump-intent.service';
import { ROADMAP_WITHDRAWN_STATES } from '../contracts/constants/roadmap.constant';
import type {
	IRoadmapDisplayHorizon,
	IRoadmapDisplayProjection,
} from '../contracts/interfaces/roadmap-display.interface';
import type {
	IRoadmap,
	IRoadmapHorizon,
} from '../contracts/interfaces/roadmap.interface';
import { summariseRoadmap } from '../read-model/roadmap-summary.service';

const displayHorizon = (horizon: IRoadmapHorizon): IRoadmapDisplayHorizon => {
	const [summary] = summariseRoadmap({
		schemaVersion: 1,
		horizons: [horizon],
	});
	const promised = horizon.entries.filter(
		(entry) =>
			!(ROADMAP_WITHDRAWN_STATES as readonly string[]).includes(
				entry.state,
			),
	);
	const intent = buildBumpIntent(horizon);
	return {
		version: horizon.version,
		...(horizon.bumpHint === undefined
			? {}
			: { bumpHint: horizon.bumpHint }),
		counts: summary?.counts ?? {
			total: 0,
			delivered: 0,
			withdrawn: 0,
			open: 0,
		},
		entries: horizon.entries.map((entry) => ({
			id: entry.id,
			title: entry.title,
			kind: entry.kind,
			state: entry.state,
			...(entry.estimate === undefined
				? {}
				: { estimate: entry.estimate }),
		})),
		declared: promised.map((entry) => entry.id),
		delivered: promised
			.filter((entry) => entry.state === 'delivered')
			.map((entry) => entry.id),
		bump: {
			kind: intent.kind,
			authority: intent.authority,
			...(intent.declared === undefined
				? {}
				: { declared: intent.declared }),
			coherent: intent.coherent,
		},
	};
};

/** The projection a page shows, from the authority file and nothing else. */
export const displayProjection = (
	file: string | null,
	roadmap: IRoadmap,
): IRoadmapDisplayProjection => ({
	file,
	horizons: roadmap.horizons.map(displayHorizon),
});

/** The bytes a projection is committed as: stable, tab-indented, newline-ended. */
export const renderDisplayProjection = (
	projection: IRoadmapDisplayProjection,
): string => `${JSON.stringify(projection, null, '\t')}\n`;
