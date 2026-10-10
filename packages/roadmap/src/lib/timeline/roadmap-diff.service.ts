import type {
	IRoadmap,
	IRoadmapEntry,
	IRoadmapHorizon,
} from '../contracts/interfaces/roadmap.interface';
import type {
	IRoadmapTimelineDraft,
	IRoadmapTimelineMeta,
} from '../contracts/interfaces/timeline.interface';

const sameJson = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a) === JSON.stringify(b);

const entryEvents = (
	version: string,
	before: IRoadmapEntry | undefined,
	after: IRoadmapEntry | undefined,
	meta: IRoadmapTimelineMeta,
): readonly IRoadmapTimelineDraft[] => {
	if (before === undefined && after !== undefined) {
		return [
			{
				...meta,
				kind: 'entry-added',
				horizon: version,
				entryId: after.id,
				entry: after,
			},
		];
	}
	if (before !== undefined && after === undefined) {
		return [
			{
				...meta,
				kind: 'entry-removed',
				horizon: version,
				entryId: before.id,
			},
		];
	}
	if (before === undefined || after === undefined) return [];
	const drafts: IRoadmapTimelineDraft[] = [];
	// The edit carries the state the entry had, so the state change that
	// follows stays its own fact in the history.
	const edited = { ...after, state: before.state };
	if (!sameJson(edited, before)) {
		drafts.push({
			...meta,
			kind: 'entry-edited',
			horizon: version,
			entryId: after.id,
			entry: edited,
		});
	}
	if (before.state !== after.state) {
		drafts.push({
			...meta,
			kind: 'entry-state-changed',
			horizon: version,
			entryId: after.id,
			from: before.state,
			to: after.state,
		});
	}
	return drafts;
};

const horizonEvents = (
	before: IRoadmapHorizon | undefined,
	after: IRoadmapHorizon | undefined,
	meta: IRoadmapTimelineMeta,
): readonly IRoadmapTimelineDraft[] => {
	const version = (after ?? before)?.version;
	if (version === undefined) return [];
	const ids = [
		...new Set([
			...(before?.entries ?? []).map((entry) => entry.id),
			...(after?.entries ?? []).map((entry) => entry.id),
		]),
	];
	const entries = ids.flatMap((id) =>
		entryEvents(
			version,
			before?.entries.find((entry) => entry.id === id),
			after?.entries.find((entry) => entry.id === id),
			meta,
		),
	);
	if (before === undefined) {
		return [
			{
				...meta,
				kind: 'horizon-added',
				horizon: version,
				bumpHint: after?.bumpHint,
			},
			...entries,
		];
	}
	if (after === undefined) {
		return [
			...entries,
			{ ...meta, kind: 'horizon-removed', horizon: version },
		];
	}
	const hint: readonly IRoadmapTimelineDraft[] =
		before.bumpHint === after.bumpHint
			? []
			: [
					{
						...meta,
						kind: 'horizon-hint-set',
						horizon: version,
						bumpHint: after.bumpHint,
					},
				];
	return [...hint, ...entries];
};

/**
 * The events that turn `before` into `after`. This is what lets the
 * timeline be derived from the authority file instead of kept by hand:
 * whoever changes the file says who and why, and the facts come from the
 * difference.
 */
export const diffRoadmaps = (
	before: IRoadmap,
	after: IRoadmap,
	meta: IRoadmapTimelineMeta,
): readonly IRoadmapTimelineDraft[] => {
	const versions = [
		...new Set([
			...before.horizons.map((horizon) => horizon.version),
			...after.horizons.map((horizon) => horizon.version),
		]),
	];
	return versions.flatMap((version) =>
		horizonEvents(
			before.horizons.find((horizon) => horizon.version === version),
			after.horizons.find((horizon) => horizon.version === version),
			meta,
		),
	);
};
