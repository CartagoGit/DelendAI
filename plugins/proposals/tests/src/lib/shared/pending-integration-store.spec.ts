import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPendingIntegrationStore } from '@delendai/proposals/lib/shared/pending-integration-store';
import type { IPendingIntegrationEntry } from '@delendai/proposals/lib/contracts/interfaces/pending-integration.interface';

describe('pending-integration-store (f00091 S2)', () => {
	let dir = '';
	const entry = (
		branch: string,
		sliceId = 'S1',
	): IPendingIntegrationEntry => ({
		branch,
		worktreePath: `/ws/.worktrees/${branch}`,
		sliceId,
		proposalId: 'f00091',
		recordedAt: '2026-07-02T00:00:00.000Z',
	});

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'pending-integration-'));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const store = () =>
		createPendingIntegrationStore(join(dir, 'pending.json'));

	it('reads an empty state when nothing was recorded yet', async () => {
		const state = await store().read();
		expect(state.entries).toEqual([]);
	});

	it('records an entry and reads it back', async () => {
		const s = store();
		await s.record(entry('agent/orion-f00091'));
		const state = await s.read();
		expect(state.entries.map((e) => e.branch)).toEqual([
			'agent/orion-f00091',
		]);
	});

	it('is idempotent: re-recording the same branch replaces, never duplicates', async () => {
		const s = store();
		await s.record(entry('agent/orion-f00091', 'S1'));
		const list = await s.record(entry('agent/orion-f00091', 'S2'));
		expect(list).toHaveLength(1);
		expect(list[0]?.sliceId).toBe('S2');
	});

	it('prunes only the integrated branches and reports whether it removed any', async () => {
		const s = store();
		await s.record(entry('agent/a-f00091'));
		await s.record(entry('agent/b-f00091'));
		const removed = await s.prune(new Set(['agent/a-f00091']));
		expect(removed).toBe(true);
		expect((await s.read()).entries.map((e) => e.branch)).toEqual([
			'agent/b-f00091',
		]);
		// Pruning a branch that isn't pending removes nothing.
		expect(await s.prune(new Set(['agent/nope']))).toBe(false);
	});
});
