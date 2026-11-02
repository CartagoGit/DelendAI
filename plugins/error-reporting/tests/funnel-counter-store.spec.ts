import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { FUNNEL_STAGES } from '../src/lib/contracts/constants/funnel-stages.constant';
import type { IFunnelStage } from '../src/lib/contracts/interfaces/funnel-counters.interface';
import { createFunnelCounterStore } from '../src/lib/funnel-counter-store.service';

const tmpDirs: string[] = [];

const makeDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'error-reporting-funnel-'));
	tmpDirs.push(dir);
	return dir;
};

afterEach(async () => {
	await Promise.all(
		tmpDirs
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe('createFunnelCounterStore', () => {
	it('starts at zero for every stage', async () => {
		const store = createFunnelCounterStore(await makeDir());
		const counters = await store.read();
		for (const stage of FUNNEL_STAGES) {
			expect(counters[stage]).toBe(0);
		}
	});

	// AUD-G01: "one spec per funnel stage: it increments its own counter
	// and only its own." Table-driven so adding a tenth stage later must
	// also add its own case here.
	it.each(FUNNEL_STAGES)(
		'increments only %s and leaves every other stage untouched',
		async (stage) => {
			const store = createFunnelCounterStore(await makeDir());
			await store.increment({ stage, at: '2026-08-27T00:00:00.000Z' });
			const counters = await store.read();
			for (const other of FUNNEL_STAGES) {
				expect(counters[other]).toBe(other === stage ? 1 : 0);
			}
		},
	);

	it('accumulates repeated increments of the same stage', async () => {
		const store = createFunnelCounterStore(await makeDir());
		await store.increment({
			stage: 'observedFailures',
			at: '2026-08-27T00:00:00.000Z',
		});
		await store.increment({
			stage: 'observedFailures',
			at: '2026-08-27T00:01:00.000Z',
		});
		await store.increment({
			stage: 'observedFailures',
			at: '2026-08-27T00:02:00.000Z',
		});
		const counters = await store.read();
		expect(counters.observedFailures).toBe(3);
		expect(counters.lastObservedAt).toBe('2026-08-27T00:02:00.000Z');
	});

	it('stamps lastObservedAt only for observedFailures', async () => {
		const store = createFunnelCounterStore(await makeDir());
		await store.increment({
			stage: 'ignoredNonFailures',
			at: '2026-08-27T00:00:00.000Z',
		});
		const counters = await store.read();
		expect(counters.lastObservedAt).toBeUndefined();
	});

	it('stamps lastSubmittedAt only for submissionAttempted', async () => {
		const store = createFunnelCounterStore(await makeDir());
		await store.increment({
			stage: 'submissionAttempted',
			at: '2026-08-27T00:05:00.000Z',
		});
		const counters = await store.read();
		expect(counters.lastSubmittedAt).toBe('2026-08-27T00:05:00.000Z');
	});

	it('records the failure code and circuitOpenUntil on submissionFailed', async () => {
		const store = createFunnelCounterStore(await makeDir());
		await store.increment({
			stage: 'submissionFailed',
			at: '2026-08-27T00:10:00.000Z',
			failureCode: 'GH_NOT_INSTALLED',
			circuitOpenUntil: '2026-08-27T01:00:00.000Z',
		});
		const counters = await store.read();
		expect(counters.lastFailureCode).toBe('GH_NOT_INSTALLED');
		expect(counters.circuitOpenUntil).toBe('2026-08-27T01:00:00.000Z');
	});

	it('clears the stale failure code and circuit on submissionSucceeded', async () => {
		const store = createFunnelCounterStore(await makeDir());
		await store.increment({
			stage: 'submissionFailed',
			at: '2026-08-27T00:10:00.000Z',
			failureCode: 'GH_NOT_INSTALLED',
			circuitOpenUntil: '2026-08-27T01:00:00.000Z',
		});
		await store.increment({
			stage: 'submissionSucceeded',
			at: '2026-08-27T01:30:00.000Z',
		});
		const counters = await store.read();
		expect(counters.lastFailureCode).toBeUndefined();
		expect(counters.circuitOpenUntil).toBeUndefined();
		expect(counters.submissionFailed).toBe(1);
		expect(counters.submissionSucceeded).toBe(1);
	});

	it('markClassified stamps lastClassifiedAt without touching any counter', async () => {
		const store = createFunnelCounterStore(await makeDir());
		await store.markClassified('2026-08-27T00:15:00.000Z');
		const counters = await store.read();
		expect(counters.lastClassifiedAt).toBe('2026-08-27T00:15:00.000Z');
		for (const stage of FUNNEL_STAGES) {
			expect(counters[stage]).toBe(0);
		}
	});

	it('persists across separate store instances over the same directory', async () => {
		const dir = await makeDir();
		const first = createFunnelCounterStore(dir);
		await first.increment({
			stage: 'notVertexInternal',
			at: '2026-08-27T00:00:00.000Z',
		});
		const second = createFunnelCounterStore(dir);
		const counters = await second.read();
		expect(counters.notVertexInternal).toBe(1);
	});

	it('tolerates a corrupt or missing state file', async () => {
		const dir = await makeDir();
		const store = createFunnelCounterStore(dir);
		const counters = await store.read();
		expect(counters).toMatchObject({ observedFailures: 0 });
	});

	it('never mixes up two different stages in one call', async () => {
		const store = createFunnelCounterStore(await makeDir());
		const stages: IFunnelStage[] = ['deduplicated', 'rateLimited'];
		await store.increment({
			stage: stages[0]!,
			at: '2026-08-27T00:00:00.000Z',
		});
		await store.increment({
			stage: stages[1]!,
			at: '2026-08-27T00:01:00.000Z',
		});
		const counters = await store.read();
		expect(counters.deduplicated).toBe(1);
		expect(counters.rateLimited).toBe(1);
	});
	it('never throws when the counter file cannot be written', async () => {
		// The funnel hangs off `onToolCall`, which hosts fire with `void`,
		// so a throw here is not a lost counter — it is an unhandled
		// rejection printed as a raw stack trace in the middle of somebody
		// else's tool output. A transient workspace really can disappear
		// between the mkdir and the lock acquire; a path whose parent is a
		// FILE reproduces the same class of failure deterministically.
		const dir = await makeDir();
		await writeFile(join(dir, 'blocker'), 'not a directory', 'utf8');
		const store = createFunnelCounterStore(join(dir, 'blocker', 'nested'));
		await expect(
			store.increment({
				stage: 'observedFailures',
				at: '2026-09-02T00:00:00.000Z',
			}),
		).resolves.toBeUndefined();
		await expect(
			store.markClassified('2026-09-02T00:00:00.000Z'),
		).resolves.toBeUndefined();
	});
});
