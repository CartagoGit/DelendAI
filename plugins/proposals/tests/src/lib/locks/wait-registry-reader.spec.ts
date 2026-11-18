import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	deriveWaitRegistryPath,
	readWaitDiagnostics,
} from '../../../../src/lib/locks/wait-registry-reader';

import type { ILockEntry } from '../../../../src/lib/locks/agent-lock-engine';

const NOW = Date.parse('2026-09-02T12:00:00.000Z');

const entry = (taskId: string, agent: string): ILockEntry =>
	({
		task_id: taskId,
		agent,
		ownership: [],
		started_at: new Date(NOW).toISOString(),
		last_seen: new Date(NOW).toISOString(),
	}) as ILockEntry;

describe('readWaitDiagnostics', () => {
	let root: string;
	let lockPathAbs: string;

	const writeWaits = (waits: readonly unknown[]): void => {
		const path = deriveWaitRegistryPath(lockPathAbs);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify({ version: 1, waits }));
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'wait-registry-'));
		lockPathAbs = join(root, 'agents.lock.json');
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('reports nothing when nobody has ever waited', async () => {
		// A diagnostic must never fail on the absence of the thing it
		// reports about.
		expect(
			await readWaitDiagnostics({
				lockPathAbs,
				inFlight: [],
				nowMs: NOW,
			}),
		).toEqual({ waits: [], deadlocks: [] });
	});

	it('resolves the waited-on task to the agent holding it', async () => {
		writeWaits([
			{
				waiter: 'A',
				waitingOnTaskId: 't2',
				since: new Date(NOW - 30_000).toISOString(),
			},
		]);
		const result = await readWaitDiagnostics({
			lockPathAbs,
			inFlight: [entry('t2', 'B')],
			nowMs: NOW,
		});
		expect(result.waits).toEqual([
			{
				waiter: 'A',
				waitingOnTaskId: 't2',
				holder: 'B',
				waitingForSeconds: 30,
			},
		]);
		expect(result.deadlocks).toEqual([]);
	});

	it('names a mutual wait as a deadlock', async () => {
		// The failure a snapshot of holders can never show: both claims
		// are healthy and heartbeating, and neither side can proceed.
		writeWaits([
			{
				waiter: 'A',
				waitingOnTaskId: 't2',
				since: new Date(NOW).toISOString(),
			},
			{
				waiter: 'B',
				waitingOnTaskId: 't1',
				since: new Date(NOW).toISOString(),
			},
		]);
		const result = await readWaitDiagnostics({
			lockPathAbs,
			inFlight: [entry('t1', 'A'), entry('t2', 'B')],
			nowMs: NOW,
		});
		expect(result.deadlocks).toEqual([['A', 'B']]);
	});

	it('reports a holder of null when the waited-on task is already gone', async () => {
		// Waiting on a released claim is not a deadlock — it resolves on
		// its own — and must not be reported as one.
		writeWaits([
			{
				waiter: 'A',
				waitingOnTaskId: 'gone',
				since: new Date(NOW).toISOString(),
			},
		]);
		const result = await readWaitDiagnostics({
			lockPathAbs,
			inFlight: [],
			nowMs: NOW,
		});
		expect(result.waits[0]?.holder).toBeNull();
		expect(result.deadlocks).toEqual([]);
	});

	it('survives a torn registry file', async () => {
		const path = deriveWaitRegistryPath(lockPathAbs);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, '{"waits": [');
		expect(
			await readWaitDiagnostics({
				lockPathAbs,
				inFlight: [],
				nowMs: NOW,
			}),
		).toEqual({ waits: [], deadlocks: [] });
	});
});
