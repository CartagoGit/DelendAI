/**
 * slice-listener.spec.ts — covers the diffing + dedupe behavior.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createSliceListener,
	readCurrentSliceSnapshot,
} from '@delendai/commit-policy/lib/triggers/slice-listener';

const writeIndex = async (
	dir: string,
	proposals: readonly {
		id: string;
		slices: readonly {
			id: string;
			status: string;
			/**
			 * x00263: every test fixture must declare the files a
			 * slice owns — the listener refuses transitions where
			 * `files` is missing, so the previous implicit-empty
			 * shape is no longer valid.
			 */
			files?: readonly string[];
		}[];
	}[],
): Promise<void> => {
	await mkdir(join(dir, 'docs', 'proposals'), { recursive: true });
	await writeFile(
		join(dir, 'docs', 'proposals', 'index.json'),
		JSON.stringify({ proposals }, null, 2),
		'utf8',
	);
};

describe('slice listener', () => {
	let workspace = '';
	const docsDir = 'docs';

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'commit-policy-slice-'));
	});

	afterEach(async () => {
		if (workspace.length > 0) {
			await rm(workspace, { recursive: true, force: true });
		}
	});

	it('emits one event per slice that transitions to a configured status', async () => {
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [
					{ id: 'S3', status: 'pending', files: ['fixture-S3-0.ts'] },
				],
			},
		]);
		const listener = createSliceListener(
			workspace,
			docsDir,
			{ kind: 'slice', onStatuses: ['done'] },
			async () => ({ ack: 'OK' }),
			1000,
		);
		expect(await listener.check()).toEqual([]);
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [
					{ id: 'S3', status: 'done', files: ['fixture-S3-1.ts'] },
				],
			},
		]);
		const events = await listener.check();
		expect(events.length).toBe(1);
		expect(events[0]?.kind).toBe('slice');
		expect(events[0]?.proposalId).toBe('f00181');
		expect(events[0]?.sliceId).toBe('S3');
		expect(events[0]?.files?.paths).toEqual(['fixture-S3-1.ts']);
	});

	it('does not re-emit when the status did not change', async () => {
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [
					{ id: 'S3', status: 'done', files: ['fixture-S3-2.ts'] },
				],
			},
		]);
		const listener = createSliceListener(
			workspace,
			docsDir,
			{ kind: 'slice', onStatuses: ['done'] },
			async () => ({ ack: 'OK' }),
			1000,
		);
		await listener.check();
		await listener.check();
		const events = await listener.check();
		expect(events.length).toBe(0);
	});

	it('respects onStatuses filter', async () => {
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [
					{ id: 'S3', status: 'pending', files: ['fixture-S3-3.ts'] },
				],
			},
		]);
		const listener = createSliceListener(
			workspace,
			docsDir,
			{ kind: 'slice', onStatuses: ['done'] },
			async () => ({ ack: 'OK' }),
			1000,
		);
		await listener.check();
		await writeIndex(workspace, [
			{ id: 'f00181', slices: [{ id: 'S3', status: 'in-progress' }] },
		]);
		const events = await listener.check();
		expect(events.length).toBe(0);
	});

	it('start()/stop() manage the interval timer without leaking', async () => {
		const listener = createSliceListener(
			workspace,
			docsDir,
			{ kind: 'slice', onStatuses: ['done'] },
			async () => ({ ack: 'OK' }),
			10,
		);
		listener.start();
		listener.stop();
		listener.stop();
		expect(true).toBe(true);
	});

	it('refuses done slices that do not declare files and never calls the handler', async () => {
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [
					{
						id: 'S3',
						status: 'pending',
						files: ['fixture-S3-10.ts'],
					},
				],
			},
		]);
		const handle = vi.fn(async () => ({ ack: 'OK' as const }));
		const listener = createSliceListener(
			workspace,
			docsDir,
			{ kind: 'slice', onStatuses: ['done'] },
			handle,
			1000,
		);

		await listener.check();
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [{ id: 'S3', status: 'done' }],
			},
		]);

		expect(await listener.check()).toEqual([]);
		expect(handle).not.toHaveBeenCalled();
		expect(listener.drainRefusals()).toEqual([
			{ key: 'f00181-S3', reason: 'SLICE_HAS_NO_FILES: f00181-S3' },
		]);
	});

	it('start() performs an immediate check before the polling interval', async () => {
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [
					{ id: 'S3', status: 'pending', files: ['fixture-S3-8.ts'] },
				],
			},
		]);
		const seen: string[] = [];
		const listener = createSliceListener(
			workspace,
			docsDir,
			{ kind: 'slice', onStatuses: ['done'] },
			async (event) => {
				seen.push(event.sliceId ?? '');
				return { ack: 'OK' };
			},
			60_000,
		);
		await listener.check();
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [
					{ id: 'S3', status: 'done', files: ['fixture-S3-9.ts'] },
				],
			},
		]);

		listener.start();
		await new Promise<void>((resolve, reject) => {
			const deadline = Date.now() + 2_000;
			const poll = (): void => {
				if (seen.length === 1 && seen[0] === 'S3') {
					resolve();
					return;
				}
				if (Date.now() >= deadline) {
					reject(
						new Error(
							`timed out waiting for slice delivery: ${seen.join(',')}`,
						),
					);
					return;
				}
				setTimeout(poll, 10);
			};
			poll();
		});
		listener.stop();
	});

	it('treats the first successful index read as a silent baseline (f00417)', async () => {
		const seen: string[] = [];
		const listener = createSliceListener(
			workspace,
			docsDir,
			{ kind: 'slice', onStatuses: ['done'] },
			async (event) => {
				seen.push(event.sliceId ?? '');
				return { ack: 'OK' };
			},
			1000,
		);

		// First poll: index missing — empty.
		expect(await listener.check()).toEqual([]);
		// Index now appears with 1 done slice.
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [
					{ id: 'S3', status: 'done', files: ['fixture-S3-late.ts'] },
				],
			},
		]);
		// Second poll: this is the BASELINE — silently acknowledge
		// the new state without emitting a synthetic transition
		// for the slice that was already done. (The pre-f00417
		// behaviour was to replay every done slice as a new
		// event, which produced the 2026-09-02 startup storm.)
		const events = await listener.check();
		expect(events).toEqual([]);
		expect(seen).toEqual([]);
	});

	it('readCurrentSliceSnapshot returns the latest slice map', async () => {
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [
					{ id: 'S1', status: 'done', files: ['fixture-S1-0.ts'] },
					{ id: 'S2', status: 'pending', files: ['fixture-S2-0.ts'] },
				],
			},
		]);
		const snap = await readCurrentSliceSnapshot(workspace, docsDir);
		expect(snap.size).toBe(2);
		expect(snap.get('f00181-S1')?.status).toBe('done');
	});

	describe('x00260 — handler ack semantics', () => {
		it('replaying the same event manually calls the handler only once', async () => {
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'pending',
							files: ['fixture-S3-replay.ts'],
						},
					],
				},
			]);
			const handle = vi.fn(async () => ({ ack: 'OK' as const }));
			const listener = createSliceListener(
				workspace,
				docsDir,
				{ kind: 'slice', onStatuses: ['done'] },
				handle,
				1000,
			);

			await listener.check();
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'done',
							files: ['fixture-S3-replay.ts'],
						},
					],
				},
			]);
			const first = await listener.check();
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'done',
							files: ['fixture-S3-replay.ts'],
						},
					],
				},
			]);
			const replay = await listener.check();

			expect(first).toHaveLength(1);
			expect(replay).toEqual([]);
			expect(handle).toHaveBeenCalledTimes(1);
			expect(handle).toHaveBeenCalledWith({
				kind: 'slice',
				proposalId: 'f00181',
				sliceId: 'S3',
				status: 'done',
				files: { paths: ['fixture-S3-replay.ts'] },
			});
		});

		it('delivers events to the handler and marks seen on OK', async () => {
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'pending',
							files: ['fixture-S3-4.ts'],
						},
					],
				},
			]);
			const seen: string[] = [];
			const listener = createSliceListener(
				workspace,
				docsDir,
				{ kind: 'slice', onStatuses: ['done'] },
				async (event) => {
					seen.push(event.sliceId ?? '');
					return { ack: 'OK' };
				},
				1000,
			);
			// Prime: first scan initializes without emitting.
			await listener.check();
			expect(seen).toEqual([]);

			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'done',
							files: ['fixture-S3-5.ts'],
						},
					],
				},
			]);
			const events = await listener.check();
			expect(events.length).toBe(1);
			expect(seen).toEqual(['S3']);
			// Pending queue drained.
			expect(listener.drainPending()).toEqual([]);
		});

		it('retries with the exact current slice files after an engine failure', async () => {
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'pending',
							files: ['fixture-S3-before-retry.ts'],
						},
					],
				},
			]);
			const seenFiles: string[][] = [];
			let attempts = 0;
			const listener = createSliceListener(
				workspace,
				docsDir,
				{ kind: 'slice', onStatuses: ['done'] },
				async (event) => {
					attempts += 1;
					seenFiles.push([...(event.files?.paths ?? [])]);
					return attempts === 1
						? { ack: 'ERR', reason: 'retry' }
						: { ack: 'OK' };
				},
				1000,
			);
			await listener.check();
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'done',
							files: ['fixture-S3-first-attempt.ts'],
						},
					],
				},
			]);
			await listener.check();
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'done',
							files: ['fixture-S3-second-attempt.ts'],
						},
					],
				},
			]);
			await listener.check();

			expect(seenFiles).toEqual([
				['fixture-S3-first-attempt.ts'],
				['fixture-S3-second-attempt.ts'],
			]);
			expect(listener.drainPending()).toEqual([]);
		});

		it('retries a pending event when the handler returns ERR', async () => {
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'pending',
							files: ['fixture-S3-6.ts'],
						},
					],
				},
			]);
			const seen: string[] = [];
			let attempts = 0;
			const listener = createSliceListener(
				workspace,
				docsDir,
				{ kind: 'slice', onStatuses: ['done'] },
				async (event) => {
					attempts += 1;
					seen.push(event.sliceId ?? '');
					return attempts === 1
						? { ack: 'ERR', reason: 'engine refused' }
						: { ack: 'OK' };
				},
				1000,
			);
			await listener.check();
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'done',
							files: ['fixture-S3-7.ts'],
						},
					],
				},
			]);
			await listener.check();
			await listener.check();
			expect(seen).toEqual(['S3', 'S3']);
			expect(listener.drainPending()).toEqual([]);
		});

		it('re-emits the event when the handler throws', async () => {
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'pending',
							files: ['fixture-S3-8.ts'],
						},
					],
				},
			]);
			const seen: string[] = [];
			const listener = createSliceListener(
				workspace,
				docsDir,
				{ kind: 'slice', onStatuses: ['done'] },
				async (event) => {
					seen.push(event.sliceId ?? '');
					throw new Error('engine crashed');
				},
				1000,
			);
			await listener.check();
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'done',
							files: ['fixture-S3-9.ts'],
						},
					],
				},
			]);
			await listener.check();
			expect(seen.length).toBe(1);
			expect(listener.drainPending().length).toBe(1);
		});
	});

	describe('x00263 — slice files must be non-empty (no implicit skipAdd)', () => {
		it('emits the event with files.paths populated', async () => {
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{
							id: 'S3',
							status: 'pending',
							files: ['only-this.ts'],
						},
					],
				},
			]);
			const seen: {
				proposalId?: string | undefined;
				sliceId?: string | undefined;
				files?: { paths: readonly string[] } | undefined;
			}[] = [];
			const listener = createSliceListener(
				workspace,
				docsDir,
				{ kind: 'slice', onStatuses: ['done'] },
				async (event) => {
					seen.push({
						proposalId: event.proposalId,
						sliceId: event.sliceId,
						files: event.files,
					});
					return { ack: 'OK' };
				},
				1000,
			);
			await listener.check();
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [
						{ id: 'S3', status: 'done', files: ['only-this.ts'] },
					],
				},
			]);
			await listener.check();
			expect(seen.length).toBe(1);
			expect(seen[0]?.files?.paths).toEqual(['only-this.ts']);
		});

		it('refuses SLICE_HAS_NO_FILES instead of emitting an empty-files event', async () => {
			await writeIndex(workspace, [
				{ id: 'f00181', slices: [{ id: 'S3', status: 'pending' }] },
			]);
			const seen: string[] = [];
			const listener = createSliceListener(
				workspace,
				docsDir,
				{ kind: 'slice', onStatuses: ['done'] },
				async (event) => {
					seen.push(event.sliceId ?? '');
					return { ack: 'OK' };
				},
				1000,
			);
			await listener.check();
			await writeIndex(workspace, [
				{ id: 'f00181', slices: [{ id: 'S3', status: 'done' }] },
			]);
			const events = await listener.check();
			expect(events.length).toBe(0);
			expect(seen).toEqual([]);
			const refusals = listener.drainRefusals();
			expect(refusals.length).toBe(1);
			expect(refusals[0]?.reason).toContain('SLICE_HAS_NO_FILES');
		});

		it('refuses when the slice declares an empty files array', async () => {
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [{ id: 'S3', status: 'pending', files: [] }],
				},
			]);
			const listener = createSliceListener(
				workspace,
				docsDir,
				{ kind: 'slice', onStatuses: ['done'] },
				async () => ({ ack: 'OK' }),
				1000,
			);
			await listener.check();
			await writeIndex(workspace, [
				{
					id: 'f00181',
					slices: [{ id: 'S3', status: 'done', files: [] }],
				},
			]);
			const events = await listener.check();
			expect(events.length).toBe(0);
			const refusals = listener.drainRefusals();
			expect(refusals[0]?.reason).toContain('SLICE_HAS_NO_FILES');
		});

		it('drainRefusals() empties the queue and does not re-emit', async () => {
			await writeIndex(workspace, [
				{ id: 'f00181', slices: [{ id: 'S3', status: 'pending' }] },
			]);
			const listener = createSliceListener(
				workspace,
				docsDir,
				{ kind: 'slice', onStatuses: ['done'] },
				async () => ({ ack: 'OK' }),
				1000,
			);
			await listener.check();
			await writeIndex(workspace, [
				{ id: 'f00181', slices: [{ id: 'S3', status: 'done' }] },
			]);
			await listener.check();
			expect(listener.drainRefusals().length).toBe(1);
			// Second drain: empty.
			expect(listener.drainRefusals().length).toBe(0);
			// Re-running check does not re-emit the refusal — the
			// underlying slice did not change.
			await listener.check();
			expect(listener.drainRefusals().length).toBe(0);
		});
	});
});
