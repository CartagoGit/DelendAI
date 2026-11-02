/**
 * tail-and-incident-window.spec.ts — a tail page is never cut short by
 * how many day-files it opened, and says how many; incidents are counted
 * over a window the answer names.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { logIncidents } from '../../../../src/lib/services/log-search-incidents';
import { createLogStore } from '../../../../src/lib/services/log-store';
import { normalizeEvent } from '../../../../src/lib/services/normalize-event';

const DAY = 24 * 60 * 60 * 1000;

describe('tailPage', () => {
	it('reads back day-file by day-file until the page is full, and counts them', async () => {
		const store = await createLogStore(
			await mkdtemp(join(tmpdir(), 'logs-tail-')),
		);
		// One event a day for five days: a ten-event page needs all five.
		for (let day = 0; day < 5; day += 1)
			await store.appendEvent(
				normalizeEvent(
					'tool-completed',
					{ toolName: `t${day}` },
					new Date(Date.UTC(2026, 5, 10 + day, 12)),
				),
			);
		const page = await store.tailPage?.({ limit: 10 });
		expect(page?.events).toHaveLength(5);
		expect(page?.filesRead).toBe(5);
		expect(page?.filesTotal).toBe(5);
		const short = await store.tailPage?.({ limit: 1 });
		expect(short?.events).toHaveLength(1);
		expect(short?.filesRead).toBe(1);
	});
});

describe('logIncidents window', () => {
	it('counts over the day up to the newest failure, and names the window', async () => {
		const store = await createLogStore(
			await mkdtemp(join(tmpdir(), 'logs-incidents-')),
		);
		const newest = Date.UTC(2026, 5, 20, 12);
		const fail = (at: number, toolName: string) =>
			store.appendEvent(
				normalizeEvent(
					'tool-failed',
					{ toolName, error: { message: 'boom' } },
					new Date(at),
				),
			);
		// A recurrence from a month ago, outside the window.
		await fail(newest - 30 * DAY, 'old');
		await fail(newest - 30 * DAY + 1000, 'old');
		await fail(newest - 60_000, 'now');
		await fail(newest, 'now');
		await fail(newest - 1000, 'once');
		const result = await logIncidents(store, { now: () => newest + 5000 });
		expect(result.incidents.map((incident) => incident.toolName)).toEqual([
			'now',
		]);
		expect(result.belowMinCount).toBe(1);
		expect(result.window).toEqual({
			since: new Date(newest - DAY).toISOString(),
			until: new Date(newest).toISOString(),
			newestFailureAgeMs: 5000,
		});
	});
});
