import { ROADMAP_SCHEMA_VERSION } from '../contracts/constants/roadmap.constant';
import type {
	IRoadmap,
	IRoadmapEntry,
	IRoadmapHorizon,
	IRoadmapResult,
} from '../contracts/interfaces/roadmap.interface';
import type { IRoadmapTimelineEvent } from '../contracts/interfaces/timeline.interface';

const fail = (
	event: IRoadmapTimelineEvent,
	why: string,
): IRoadmapResult<never> => ({
	ok: false,
	reason: `timeline event ${event.seq} (${event.kind}) ${why}`,
});

const withoutUndefined = <T extends object>(value: T): T =>
	Object.fromEntries(
		Object.entries(value).filter(([, field]) => field !== undefined),
	) as T;

const horizonOf = (
	horizons: readonly IRoadmapHorizon[],
	version: string,
): IRoadmapHorizon | undefined =>
	horizons.find((horizon) => horizon.version === version);

const replaceHorizon = (
	horizons: readonly IRoadmapHorizon[],
	next: IRoadmapHorizon,
): readonly IRoadmapHorizon[] =>
	horizons.map((horizon) =>
		horizon.version === next.version ? next : horizon,
	);

const mapEntry = (
	horizon: IRoadmapHorizon,
	entryId: string,
	change: (entry: IRoadmapEntry) => IRoadmapEntry,
): IRoadmapHorizon => ({
	...horizon,
	entries: horizon.entries.map((entry) =>
		entry.id === entryId ? change(entry) : entry,
	),
});

const applyEvent = (
	horizons: readonly IRoadmapHorizon[],
	event: IRoadmapTimelineEvent,
): IRoadmapResult<readonly IRoadmapHorizon[]> => {
	const horizon = horizonOf(horizons, event.horizon);
	if (event.kind === 'horizon-added') {
		if (horizon !== undefined)
			return fail(event, 'adds a horizon that exists');
		return {
			ok: true,
			value: [
				...horizons,
				withoutUndefined({
					version: event.horizon,
					bumpHint: event.bumpHint,
					entries: [],
				}),
			],
		};
	}
	if (horizon === undefined)
		return fail(event, 'names a horizon that does not exist');
	if (event.kind === 'horizon-removed') {
		return {
			ok: true,
			value: horizons.filter(
				(candidate) => candidate.version !== event.horizon,
			),
		};
	}
	if (event.kind === 'horizon-hint-set') {
		return {
			ok: true,
			value: replaceHorizon(
				horizons,
				withoutUndefined({ ...horizon, bumpHint: event.bumpHint }),
			),
		};
	}
	return applyEntryEvent(horizons, horizon, event);
};

const applyEntryEvent = (
	horizons: readonly IRoadmapHorizon[],
	horizon: IRoadmapHorizon,
	event: IRoadmapTimelineEvent,
): IRoadmapResult<readonly IRoadmapHorizon[]> => {
	const present = horizon.entries.some((entry) => entry.id === event.entryId);
	if (event.entryId === undefined) return fail(event, 'names no entry');
	if (event.kind === 'entry-added') {
		if (present) return fail(event, 'adds an entry that exists');
		if (event.entry === undefined) return fail(event, 'carries no entry');
		return {
			ok: true,
			value: replaceHorizon(horizons, {
				...horizon,
				entries: [...horizon.entries, event.entry],
			}),
		};
	}
	if (!present) return fail(event, 'names an entry that does not exist');
	const entryId = event.entryId;
	if (event.kind === 'entry-removed') {
		return {
			ok: true,
			value: replaceHorizon(horizons, {
				...horizon,
				entries: horizon.entries.filter(
					(entry) => entry.id !== entryId,
				),
			}),
		};
	}
	if (event.kind === 'entry-edited') {
		const edited = event.entry;
		if (edited === undefined) return fail(event, 'carries no entry');
		return {
			ok: true,
			value: replaceHorizon(
				horizons,
				mapEntry(horizon, entryId, () => edited),
			),
		};
	}
	if (event.to === undefined) return fail(event, 'names no target state');
	const to = event.to;
	return {
		ok: true,
		value: replaceHorizon(
			horizons,
			mapEntry(horizon, entryId, (entry) => ({ ...entry, state: to })),
		),
	};
};

/**
 * Rebuilds the roadmap the history describes. An event that refers to
 * something the earlier events never created is reported, not skipped:
 * a history with a hole in it is not one to trust.
 */
export const replayTimeline = (
	events: readonly IRoadmapTimelineEvent[],
): IRoadmapResult<IRoadmap> => {
	let horizons: readonly IRoadmapHorizon[] = [];
	for (const event of events) {
		const next = applyEvent(horizons, event);
		if (!next.ok) return next;
		horizons = next.value;
	}
	return {
		ok: true,
		value: { schemaVersion: ROADMAP_SCHEMA_VERSION, horizons },
	};
};

/**
 * The roadmap with horizons ordered by version and entries by id and no
 * undefined fields, so two roadmaps that say the same compare equal
 * whatever order they were written in.
 */
export const canonicalRoadmap = (roadmap: IRoadmap): IRoadmap => ({
	schemaVersion: roadmap.schemaVersion,
	horizons: [...roadmap.horizons]
		.map((horizon) =>
			withoutUndefined({
				...horizon,
				entries: [...horizon.entries]
					.map((entry) => withoutUndefined(entry))
					.sort((a, b) => a.id.localeCompare(b.id)),
			}),
		)
		.sort((a, b) => a.version.localeCompare(b.version)),
});
