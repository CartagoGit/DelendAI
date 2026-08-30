/**
 * processed-events.spec.ts — covers f00183 (AUD-CP-012)
 * idempotency store: key computation, persistence, TTL prune.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	computeIdempotencyKey,
	createProcessedEventsStore,
} from '@mcp-vertex/commit-policy/lib/processed-events';
import type { IEngineEvent } from '@mcp-vertex/commit-policy/lib/engine';

let workspace = '';

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'commit-policy-idempotency-'));
});

afterEach(async () => {
	if (workspace.length > 0) {
		await rm(workspace, { recursive: true, force: true });
	}
});

describe('computeIdempotencyKey', () => {
	it('uses proposalId+sliceId+eventId for slice events', () => {
		const event: IEngineEvent = {
			kind: 'slice',
			proposalId: 'f00181',
			sliceId: 'S3',
			files: ['x.ts'],
			eventId: 'e1',
		};
		expect(computeIdempotencyKey(event)).toBe('commit-policy:f00181:S3:e1');
	});

	it('uses eventId+dirtyCount for threshold events', () => {
		const event: IEngineEvent = {
			kind: 'threshold',
			files: ['x.ts'],
			dirtyCount: 3,
			eventId: 't1',
		};
		expect(computeIdempotencyKey(event)).toBe(
			'commit-policy:threshold:t1:3',
		);
	});

	it('uses eventId+dirtyCount for interval events', () => {
		const event: IEngineEvent = {
			kind: 'interval',
			files: ['x.ts'],
			dirtyCount: 1,
			eventId: 'i1',
		};
		expect(computeIdempotencyKey(event)).toBe(
			'commit-policy:interval:i1:1',
		);
	});

	it('uses eventId for manual events', () => {
		const event: IEngineEvent = {
			kind: 'manual',
			message: 'feat: x',
			eventId: 'm1',
		};
		expect(computeIdempotencyKey(event)).toBe('commit-policy:manual:m1');
	});

	it('is reproducible across calls', () => {
		const event: IEngineEvent = {
			kind: 'slice',
			proposalId: 'f00181',
			sliceId: 'S3',
			files: ['x.ts'],
			eventId: 'e1',
		};
		expect(computeIdempotencyKey(event)).toBe(computeIdempotencyKey(event));
	});
});

describe('createProcessedEventsStore', () => {
	it('returns false for unknown keys', async () => {
		const store = createProcessedEventsStore({ workspaceRoot: workspace });
		expect(await store.has('nope')).toBe(false);
	});

	it('persists a key after add()', async () => {
		const store = createProcessedEventsStore({ workspaceRoot: workspace });
		await store.add('commit-policy:f00181:S3:e1', 'abc123', 1_000);
		expect(await store.has('commit-policy:f00181:S3:e1')).toBe(true);
	});

	it('persists to the JSONL file', async () => {
		const store = createProcessedEventsStore({ workspaceRoot: workspace });
		await store.add('k1', 'sha1', 1_000);
		const raw = await readFile(
			join(workspace, '.commit-policy/processed-events.jsonl'),
			'utf8',
		);
		expect(raw).toContain('"key":"k1"');
		expect(raw).toContain('"sha":"sha1"');
	});

	it('reloads the in-memory map from disk on next call', async () => {
		const storeA = createProcessedEventsStore({ workspaceRoot: workspace });
		await storeA.add('k1', 'sha1', 1_000);
		// Discard the in-memory cache; a fresh instance should
		// re-hydrate from the file.
		await storeA.dispose();
		const storeB = createProcessedEventsStore({ workspaceRoot: workspace });
		expect(await storeB.has('k1')).toBe(true);
		await storeB.dispose();
	});

	it('merges concurrent writers without losing either idempotency key', async () => {
		const storeA = createProcessedEventsStore({ workspaceRoot: workspace });
		const storeB = createProcessedEventsStore({ workspaceRoot: workspace });
		await Promise.all([
			storeA.add('writer-a', 'sha-a', 1_000),
			storeB.add('writer-b', 'sha-b', 2_000),
		]);
		const storeC = createProcessedEventsStore({ workspaceRoot: workspace });
		expect(await storeC.has('writer-a')).toBe(true);
		expect(await storeC.has('writer-b')).toBe(true);
	});

	it('reloads persisted idempotency state after a store restart', async () => {
		const first = createProcessedEventsStore({ workspaceRoot: workspace });
		expect(await first.has('restart-event')).toBe(false);
		await first.add('restart-event', 'sha-restart', 1_000);
		await first.dispose();

		const restarted = createProcessedEventsStore({
			workspaceRoot: workspace,
		});
		expect(await restarted.has('restart-event')).toBe(true);
		await restarted.dispose();
	});

	it('prune() removes entries older than ttlMs', async () => {
		const store = createProcessedEventsStore({
			workspaceRoot: workspace,
			ttlMs: 1_000,
		});
		await store.add('old', 'sha1', 0);
		await store.add('new', 'sha2', 2_000);
		const removed = await store.prune(2_000);
		expect(removed).toBe(1);
		expect(await store.has('old')).toBe(false);
		expect(await store.has('new')).toBe(true);
		await store.dispose();
	});
});
