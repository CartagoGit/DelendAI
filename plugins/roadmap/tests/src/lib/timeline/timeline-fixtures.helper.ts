import type {
	IRoadmap,
	IRoadmapEntry,
} from '../../../../src/lib/contracts/interfaces/roadmap.interface';
import type { IRoadmapTimelineMeta } from '../../../../src/lib/contracts/interfaces/timeline.interface';

export const META: IRoadmapTimelineMeta = {
	actor: 'maintainer',
	at: '2026-10-07T10:00:00.000Z',
	reason: 'planning the next minor',
};

export const entry = (
	id: string,
	overrides: Partial<IRoadmapEntry> = {},
): IRoadmapEntry => ({
	id,
	title: `Entry ${id}`,
	kind: 'feature',
	state: 'proposed',
	gates: [],
	...overrides,
});

export const roadmapOf = (
	...horizons: IRoadmap['horizons'][number][]
): IRoadmap => ({ schemaVersion: 1, horizons });
