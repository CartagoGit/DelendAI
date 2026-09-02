import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createAgentLockForeignLockProvider,
	deriveAgentLockPath,
} from '../../../../src/lib/services/agent-lock-foreign-locks';

const NOW = Date.now();
const minutesAgo = (minutes: number): string =>
	new Date(NOW - minutes * 60_000).toISOString();

const POLICY = { staleAfterMinutes: 10, nowMs: NOW };

describe('createAgentLockForeignLockProvider', () => {
	let root: string;
	let lockFileAbs: string;

	const writeLock = (inFlight: readonly unknown[]): void => {
		mkdirSync(dirname(lockFileAbs), { recursive: true });
		writeFileSync(
			lockFileAbs,
			JSON.stringify({
				version: 1,
				stale_after_minutes: 10,
				in_flight: inFlight,
			}),
		);
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'cp-foreign-lock-'));
		lockFileAbs = deriveAgentLockPath(root);
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('reports nothing when there is no lock file at all', async () => {
		// commit-policy without the proposals plugin is a supported
		// setup: no file, no withholding, no behaviour change.
		const provider = createAgentLockForeignLockProvider({
			lockFileAbs,
			policy: POLICY,
		});
		expect(
			await provider({ files: ['src/a.ts'], selfAgent: 'me' }),
		).toEqual([]);
	});

	it('reports a live claim held by another agent', async () => {
		writeLock([
			{
				task_id: 'f00001-S1',
				agent: 'agent-b',
				ownership: ['src/a.ts'],
				last_seen: minutesAgo(1),
			},
		]);
		const provider = createAgentLockForeignLockProvider({
			lockFileAbs,
			policy: POLICY,
		});
		const holdings = await provider({
			files: ['src/a.ts', 'src/other.ts'],
			selfAgent: 'agent-a',
		});
		expect(holdings).toEqual([
			{ file: 'src/a.ts', agent: 'agent-b', taskId: 'f00001-S1' },
		]);
	});

	it('never withholds the committer’s own claim', async () => {
		// Holding the lock is the reason this agent is committing.
		writeLock([
			{
				task_id: 'f00001-S1',
				agent: 'agent-a',
				ownership: ['src/a.ts'],
				last_seen: minutesAgo(1),
			},
		]);
		const provider = createAgentLockForeignLockProvider({
			lockFileAbs,
			policy: POLICY,
		});
		expect(
			await provider({ files: ['src/a.ts'], selfAgent: 'agent-a' }),
		).toEqual([]);
	});

	it('ignores an expired claim, exactly as the lock engine does', async () => {
		// Withholding on a claim whose owner stopped working would stall
		// commits on a lock the engine already considers dead — a file
		// free and held at the same time.
		writeLock([
			{
				task_id: 'f00001-S1',
				agent: 'agent-b',
				ownership: ['src/a.ts'],
				last_seen: minutesAgo(45),
			},
		]);
		const provider = createAgentLockForeignLockProvider({
			lockFileAbs,
			policy: POLICY,
		});
		expect(
			await provider({ files: ['src/a.ts'], selfAgent: 'agent-a' }),
		).toEqual([]);
	});

	it('reports nothing when the lock file is torn mid-write', async () => {
		mkdirSync(dirname(lockFileAbs), { recursive: true });
		writeFileSync(lockFileAbs, '{"in_flight": [');
		const provider = createAgentLockForeignLockProvider({
			lockFileAbs,
			policy: POLICY,
		});
		expect(
			await provider({ files: ['src/a.ts'], selfAgent: 'me' }),
		).toEqual([]);
	});
});
