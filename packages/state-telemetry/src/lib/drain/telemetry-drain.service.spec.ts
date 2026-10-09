import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MemoryDurationHistoryStore } from '../eta/duration-history';
import type { INewWorkEvent } from '../events/work-event';
import { drainTelemetryJournals } from './telemetry-drain.service';

describe('drainTelemetryJournals', () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'telemetry-drain-'));
		await mkdir(join(root, '.cache/delendai/telemetry'), {
			recursive: true,
		});
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('feeds the event bus and the duration history from their journals', async () => {
		const directory = join(root, '.cache/delendai/telemetry');
		await writeFile(
			join(directory, 'work-event-journal.ndjson'),
			`${JSON.stringify({ work_item_id: 'q1/S1', actor_id: 'a', kind: 'slice_claimed', payload_hash: 'h', created_at: 5 })}\n`,
		);
		await writeFile(
			join(directory, 'transition-durations.ndjson'),
			`${JSON.stringify({ to: 'review', features: { slice_count: 2 }, actorProfile: 'a', taskKind: 'feat:review', durationMs: 60_000, createdAt: 1_000 })}\n`,
		);
		const seen: INewWorkEvent[] = [];
		const history = new MemoryDurationHistoryStore({});
		const result = await drainTelemetryJournals({
			root,
			events: {
				append: async (event) => {
					seen.push(event);
				},
			},
			history,
		});
		expect(result.workEvents).toEqual({ appended: 1, skipped: 0 });
		expect(result.durations.recorded).toBe(1);
		expect(seen).toHaveLength(1);
		expect(history.count()).toBe(1);
	});

	it('drains nothing when no process has journalled yet', async () => {
		const result = await drainTelemetryJournals({
			root,
			events: { append: async () => undefined },
			history: new MemoryDurationHistoryStore({}),
		});
		expect(result.workEvents.appended).toBe(0);
		expect(result.durations.recorded).toBe(0);
	});
});
