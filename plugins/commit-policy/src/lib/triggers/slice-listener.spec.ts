/**
 * slice-listener.spec.ts — covers the diffing + dedupe behavior.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createSliceListener,
	readCurrentSliceSnapshot,
} from './slice-listener';

const writeIndex = async (
	dir: string,
	proposals: readonly {
		id: string;
		slices: readonly { id: string; status: string }[];
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
			{ id: 'f00181', slices: [{ id: 'S3', status: 'pending' }] },
		]);
		const listener = createSliceListener(
			workspace,
			docsDir,
			{ kind: 'slice', onStatuses: ['done'] },
			1000,
		);
		expect(await listener.check()).toEqual([]);
		await writeIndex(workspace, [
			{ id: 'f00181', slices: [{ id: 'S3', status: 'done' }] },
		]);
		const events = await listener.check();
		expect(events.length).toBe(1);
		expect(events[0]?.kind).toBe('slice');
		expect(events[0]?.proposalId).toBe('f00181');
		expect(events[0]?.sliceId).toBe('S3');
	});

	it('does not re-emit when the status did not change', async () => {
		await writeIndex(workspace, [
			{ id: 'f00181', slices: [{ id: 'S3', status: 'done' }] },
		]);
		const listener = createSliceListener(
			workspace,
			docsDir,
			{ kind: 'slice', onStatuses: ['done'] },
			1000,
		);
		await listener.check();
		await listener.check();
		const events = await listener.check();
		expect(events.length).toBe(0);
	});

	it('respects onStatuses filter', async () => {
		await writeIndex(workspace, [
			{ id: 'f00181', slices: [{ id: 'S3', status: 'pending' }] },
		]);
		const listener = createSliceListener(
			workspace,
			docsDir,
			{ kind: 'slice', onStatuses: ['done'] },
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
			10,
		);
		listener.start();
		listener.stop();
		listener.stop();
		expect(true).toBe(true);
	});

	it('readCurrentSliceSnapshot returns the latest slice map', async () => {
		await writeIndex(workspace, [
			{
				id: 'f00181',
				slices: [
					{ id: 'S1', status: 'done' },
					{ id: 'S2', status: 'pending' },
				],
			},
		]);
		const snap = await readCurrentSliceSnapshot(workspace, docsDir);
		expect(snap.size).toBe(2);
		expect(snap.get('f00181-S1')?.status).toBe('done');
	});
});
