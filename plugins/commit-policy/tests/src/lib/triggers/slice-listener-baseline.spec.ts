/**
 * slice-listener-baseline.spec.ts — x00423.
 *
 * The first poll has to tell two situations apart, and until now it
 * could not:
 *
 *   - the repo's history: hundreds of slices that reached `done` weeks
 *     ago and were committed at the time. Re-emitting them is the
 *     2026-09-02 startup storm.
 *
 *   - work that finished while nobody was listening: a slice closed
 *     during a server restart, or before this plugin was lazily
 *     activated. Nothing persisted it, and staying silent loses the
 *     commit with no error, no retry and no trace.
 *
 * Treating both as "baseline" is what the unconditional `{ events: [] }`
 * did. These tests pin the distinction so it cannot be flattened again.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	BASELINE_EMIT_LIMIT,
	createSliceListener,
	type ITriggerEvent,
} from '../../../../src/lib/triggers/slice-listener';

const SLICE_TRIGGER = { kind: 'slice' as const, onStatuses: ['done'] };

describe('slice listener first-poll baseline', () => {
	let workspace = '';

	/** Write an index.json holding `count` done slices. */
	const seedIndex = async (count: number): Promise<void> => {
		const cacheDir = join(workspace, '.cache', 'mcp-vertex');
		await mkdir(join(cacheDir, 'proposals'), { recursive: true });
		const proposals = Array.from({ length: count }, (_unused, index) => ({
			id: `p${String(index).padStart(5, '0')}`,
			slices: [
				{
					id: 'S1',
					status: 'done',
					files: [`file-${String(index)}.ts`],
				},
			],
		}));
		await writeFile(
			join(cacheDir, 'proposals', 'index.json'),
			JSON.stringify({ proposals }),
			'utf8',
		);
	};

	const collect = async (
		isAlreadyPersisted: (event: ITriggerEvent) => Promise<boolean>,
	): Promise<readonly ITriggerEvent[]> => {
		const seen: ITriggerEvent[] = [];
		const listener = createSliceListener(
			workspace,
			join('.cache', 'mcp-vertex'),
			SLICE_TRIGGER,
			async (event) => {
				seen.push(event);
				return { ack: 'OK' };
			},
			undefined,
			join('.cache', 'mcp-vertex'),
			isAlreadyPersisted,
		);
		await listener.check();
		listener.stop?.();
		return seen;
	};

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'slice-baseline-'));
	});
	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('stays silent for history the store has already accounted for', async () => {
		await seedIndex(83);
		const seen = await collect(async () => true);
		expect(seen).toHaveLength(0);
	});

	it('emits the slice that finished while no listener was running', async () => {
		await seedIndex(1);
		const seen = await collect(async () => false);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.proposalId).toBe('p00000');
	});

	it('caps a cold start instead of replaying the whole history', async () => {
		// An empty store — a fresh clone, or `.commit-policy/` deleted —
		// makes every historical slice look un-persisted. Bounded work
		// beats both a flood and a silent drop.
		await seedIndex(200);
		const seen = await collect(async () => false);
		expect(seen).toHaveLength(BASELINE_EMIT_LIMIT);
	});

	it('falls back to silence when the store cannot be read', async () => {
		// A missed commit is recoverable by hand; a storm is not. So an
		// unreadable store must not become a replay.
		await seedIndex(50);
		const seen = await collect(async () => {
			throw new Error('store unreadable');
		});
		expect(seen).toHaveLength(0);
	});

	it('keeps the old silent baseline when no store is wired', async () => {
		await seedIndex(50);
		const seen: ITriggerEvent[] = [];
		const listener = createSliceListener(
			workspace,
			join('.cache', 'mcp-vertex'),
			SLICE_TRIGGER,
			async (event) => {
				seen.push(event);
				return { ack: 'OK' };
			},
			undefined,
			join('.cache', 'mcp-vertex'),
		);
		await listener.check();
		listener.stop?.();
		expect(seen).toHaveLength(0);
	});
});
