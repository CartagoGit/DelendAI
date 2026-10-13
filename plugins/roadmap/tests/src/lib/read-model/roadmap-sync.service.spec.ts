import { describe, expect, it } from 'vitest';

import {
	pendingTimelineDrafts,
	syncReport,
} from '../../../../src/lib/read-model/roadmap-sync.service';
import { sealDrafts } from '../../../../src/lib/timeline/timeline-seal.helper';
import { entry, horizon, roadmapOf } from './read-model.fixture';

const meta = { actor: 'spec', at: '2026-10-11T00:00:00.000Z', reason: 'sync' };
const roadmap = roadmapOf(horizon('0.5.0', [entry('a', 'committed')]));

describe('pendingTimelineDrafts', () => {
	it('is everything the file holds when nothing was recorded', () => {
		const pending = pendingTimelineDrafts(roadmap, [], meta);
		if (!pending.ok) throw new Error(pending.reason);
		expect(pending.value.map((draft) => draft.kind)).toEqual([
			'horizon-added',
			'entry-added',
		]);
	});

	it('is empty once the recorded events replay to the file', () => {
		const first = pendingTimelineDrafts(roadmap, [], meta);
		if (!first.ok) throw new Error(first.reason);
		const sealed = sealDrafts(0, first.value);
		if (!sealed.ok) throw new Error(sealed.reason);
		const second = pendingTimelineDrafts(roadmap, sealed.value, meta);
		expect(second).toEqual({ ok: true, value: [] });
	});

	it('is only the change made since', () => {
		const first = pendingTimelineDrafts(roadmap, [], meta);
		if (!first.ok) throw new Error(first.reason);
		const sealed = sealDrafts(0, first.value);
		if (!sealed.ok) throw new Error(sealed.reason);
		const moved = roadmapOf(horizon('0.5.0', [entry('a', 'in-progress')]));
		const pending = pendingTimelineDrafts(moved, sealed.value, meta);
		if (!pending.ok) throw new Error(pending.reason);
		expect(pending.value.map((draft) => draft.kind)).toEqual([
			'entry-state-changed',
		]);
	});
});

describe('syncReport', () => {
	it('says in sync with nothing pending', () => {
		expect(syncReport(3, [])).toEqual({
			inSync: true,
			recorded: 3,
			pending: [],
		});
	});

	it('names what the timeline lacks, without the entry bodies', () => {
		const pending = pendingTimelineDrafts(roadmap, [], meta);
		if (!pending.ok) throw new Error(pending.reason);
		const report = syncReport(0, pending.value);
		expect(report.inSync).toBe(false);
		expect(report.pending).toEqual([
			{ kind: 'horizon-added', horizon: '0.5.0' },
			{ kind: 'entry-added', horizon: '0.5.0', entryId: 'a' },
		]);
	});
});
