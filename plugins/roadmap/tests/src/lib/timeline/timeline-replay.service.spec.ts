import { describe, expect, it } from 'vitest';

import type { IRoadmap } from '../../../../src/lib/contracts/interfaces/roadmap.interface';
import type { IRoadmapTimelineEvent } from '../../../../src/lib/contracts/interfaces/timeline.interface';
import { diffRoadmaps } from '../../../../src/lib/timeline/roadmap-diff.service';
import {
	canonicalRoadmap,
	replayTimeline,
} from '../../../../src/lib/timeline/timeline-replay.service';
import { META, entry, roadmapOf } from './timeline-fixtures.helper';

const EMPTY: IRoadmap = { schemaVersion: 1, horizons: [] };

/** Walks a series of roadmaps, collecting the events between each pair. */
const historyOf = (steps: readonly IRoadmap[]): IRoadmapTimelineEvent[] => {
	const events: IRoadmapTimelineEvent[] = [];
	let previous = EMPTY;
	for (const step of steps) {
		for (const draft of diffRoadmaps(previous, step, META)) {
			events.push({ ...draft, seq: events.length + 1 });
		}
		previous = step;
	}
	return events;
};

const expectSameAsFile = (steps: readonly IRoadmap[]): void => {
	const replayed = replayTimeline(historyOf(steps));
	expect(replayed.ok).toBe(true);
	const last = steps.at(-1) ?? EMPTY;
	if (replayed.ok) {
		expect(canonicalRoadmap(replayed.value)).toEqual(
			canonicalRoadmap(last),
		);
	}
};

describe('replaying the timeline', () => {
	it('rebuilds the file from a first write', () => {
		expectSameAsFile([
			roadmapOf({
				version: '0.5.0',
				bumpHint: 'minor',
				entries: [entry('a'), entry('b', { kind: 'fix' })],
			}),
		]);
	});

	it('rebuilds the file after edits, state changes and removals', () => {
		expectSameAsFile([
			roadmapOf({ version: '0.5.0', entries: [entry('a'), entry('b')] }),
			roadmapOf({
				version: '0.5.0',
				entries: [entry('a', { state: 'committed' }), entry('b')],
			}),
			roadmapOf({
				version: '0.5.0',
				bumpHint: 'minor',
				entries: [
					entry('a', {
						state: 'in-progress',
						title: 'Renamed',
						note: 'why',
					}),
					entry('b', { state: 'deferred' }),
					entry('c', { kind: 'breaking' }),
				],
			}),
			roadmapOf(
				{
					version: '0.5.0',
					entries: [entry('c', { kind: 'breaking' })],
				},
				{ version: '0.6.0', entries: [entry('b')] },
			),
		]);
	});

	it('rebuilds the file when a hint is set and then cleared', () => {
		expectSameAsFile([
			roadmapOf({ version: '1.0.0', bumpHint: 'major', entries: [] }),
			roadmapOf({ version: '1.0.0', entries: [] }),
		]);
	});

	it('rebuilds the file when a whole horizon goes away', () => {
		expectSameAsFile([
			roadmapOf({ version: '0.5.0', entries: [entry('a')] }),
			EMPTY,
		]);
	});

	it('records a state change as its own fact with both states', () => {
		const events = historyOf([
			roadmapOf({ version: '0.5.0', entries: [entry('a')] }),
			roadmapOf({
				version: '0.5.0',
				entries: [entry('a', { state: 'committed' })],
			}),
		]);
		const change = events.at(-1);
		expect(change?.kind).toBe('entry-state-changed');
		expect(change?.from).toBe('proposed');
		expect(change?.to).toBe('committed');
	});

	it('produces no events when nothing changed', () => {
		const same = roadmapOf({ version: '0.5.0', entries: [entry('a')] });
		expect(diffRoadmaps(same, same, META)).toEqual([]);
	});

	it('reports an event that refers to something never created', () => {
		const replayed = replayTimeline([
			{
				...META,
				seq: 1,
				kind: 'entry-state-changed',
				horizon: '0.5.0',
				entryId: 'ghost',
				to: 'committed',
			},
		]);
		expect(replayed.ok).toBe(false);
		if (!replayed.ok)
			expect(replayed.reason).toContain('horizon that does not exist');
	});

	it('reports adding an entry twice', () => {
		const add = (seq: number): IRoadmapTimelineEvent => ({
			...META,
			seq,
			kind: 'entry-added',
			horizon: '0.5.0',
			entryId: 'a',
			entry: entry('a'),
		});
		const replayed = replayTimeline([
			{ ...META, seq: 1, kind: 'horizon-added', horizon: '0.5.0' },
			add(2),
			add(3),
		]);
		expect(replayed.ok).toBe(false);
	});
});
