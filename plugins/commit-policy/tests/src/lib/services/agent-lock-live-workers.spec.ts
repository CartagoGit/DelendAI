import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deriveAgentLockPath } from '../../../../src/lib/services/agent-lock-foreign-locks';
import {
	countLiveAgentWorkers,
	createLiveAgentWorkerCounter,
} from '../../../../src/lib/services/agent-lock-live-workers';

const NOW = Date.now();
const minutesAgo = (minutes: number): string =>
	new Date(NOW - minutes * 60_000).toISOString();

const POLICY = { staleAfterMinutes: 10, nowMs: NOW };

describe('countLiveAgentWorkers', () => {
	let root: string;
	let lockFileAbs: string;

	const writeRaw = (content: string): void => {
		mkdirSync(dirname(lockFileAbs), { recursive: true });
		writeFileSync(lockFileAbs, content);
	};
	const writeLock = (inFlight: unknown): void =>
		writeRaw(
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: inFlight,
			}),
		);

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'cp-live-workers-'));
		lockFileAbs = deriveAgentLockPath(root);
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('counts no workers when there is no lock file or directory', async () => {
		expect(
			await countLiveAgentWorkers({ lockFileAbs, policy: POLICY }),
		).toBe(0);
		mkdirSync(dirname(lockFileAbs), { recursive: true });
		expect(
			await countLiveAgentWorkers({ lockFileAbs, policy: POLICY }),
		).toBe(0);
	});

	it('counts each agent with a live claim once', async () => {
		writeLock([
			{
				task_id: 'f00001-S1',
				agent: 'agent-a',
				last_seen: minutesAgo(1),
			},
			{
				task_id: 'f00001-S2',
				agent: 'agent-a',
				last_seen: minutesAgo(2),
			},
			{
				task_id: 'f00002-S1',
				agent: 'agent-b',
				last_seen: minutesAgo(3),
			},
			{ task_id: 'f00003-S1', last_seen: minutesAgo(1) },
		]);
		expect(
			await countLiveAgentWorkers({ lockFileAbs, policy: POLICY }),
		).toBe(3);
	});

	it('ignores stale, orphaned, anonymous and malformed entries', async () => {
		writeLock([
			{ task_id: 'f00001-S1', agent: 'stale', last_seen: minutesAgo(30) },
			{
				task_id: 'f00002-S1',
				agent: 'orphan',
				last_seen: minutesAgo(1),
				host: 'this-host',
				pid: 4242,
			},
			{ last_seen: minutesAgo(1) },
			null,
			'not-an-entry',
			{ task_id: 'f00003-S1', agent: 'live', last_seen: minutesAgo(1) },
		]);
		expect(
			await countLiveAgentWorkers({
				lockFileAbs,
				policy: {
					...POLICY,
					host: 'this-host',
					isProcessAlive: () => false,
				},
			}),
		).toBe(1);
	});

	it('counts no workers for a lock without in_flight claims', async () => {
		writeRaw(JSON.stringify({ version: 1 }));
		expect(
			await countLiveAgentWorkers({ lockFileAbs, policy: POLICY }),
		).toBe(0);
	});

	it('reports an unreadable lock with an unknown count, never zero', async () => {
		writeRaw('{ "in_flight": [ torn');
		expect(
			await countLiveAgentWorkers({ lockFileAbs, policy: POLICY }),
		).toBeNull();

		writeLock({ agent: 'not-a-list' });
		expect(
			await countLiveAgentWorkers({ lockFileAbs, policy: POLICY }),
		).toBeNull();

		rmSync(lockFileAbs);
		mkdirSync(lockFileAbs);
		expect(
			await countLiveAgentWorkers({ lockFileAbs, policy: POLICY }),
		).toBeNull();
	});

	it('exposes the count as a zero-argument source', async () => {
		writeLock([
			{
				task_id: 'f00001-S1',
				agent: 'agent-a',
				last_seen: minutesAgo(1),
			},
		]);
		const count = createLiveAgentWorkerCounter({
			lockFileAbs,
			policy: POLICY,
		});
		expect(await count()).toBe(1);
	});
});
