/**
 * read-model.fixture.ts — a small roadmap the read-model specs share.
 */
import type {
	IRoadmap,
	IRoadmapEntry,
	IRoadmapHorizon,
} from '../../../../src/lib/contracts/interfaces/roadmap.interface';

export const entry = (
	id: string,
	state: IRoadmapEntry['state'],
	gates: IRoadmapEntry['gates'] = [],
	kind: IRoadmapEntry['kind'] = 'feature',
): IRoadmapEntry => ({ id, title: `Entry ${id}`, kind, state, gates });

export const horizon = (
	version: string,
	entries: readonly IRoadmapEntry[],
	bumpHint?: IRoadmapHorizon['bumpHint'],
): IRoadmapHorizon => ({
	version,
	...(bumpHint === undefined ? {} : { bumpHint }),
	entries,
});

export const roadmapOf = (...horizons: IRoadmapHorizon[]): IRoadmap => ({
	schemaVersion: 1,
	horizons,
});
