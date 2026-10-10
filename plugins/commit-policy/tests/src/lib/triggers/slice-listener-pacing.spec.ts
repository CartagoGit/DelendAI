/**
 * slice-listener-pacing.spec.ts — a poll that was expensive is followed
 * by a rest in proportion, so polling a large tree never holds a core.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSliceListener } from '@delendai/commit-policy/lib/triggers/slice-listener';
import { SafeWorkspaceReader } from '@delendai/core/runtime';

import { writeProposalDocuments } from './proposal-documents.fixture';

const POLL_MS = 5;
/** Long enough for some twenty polls at `POLL_MS`. */
const OBSERVED_MS = 100;

describe('slice listener pacing', () => {
	let workspace = '';

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'commit-policy-pacing-'));
		await writeProposalDocuments(join(workspace, 'docs', 'proposals'), [
			{ id: 'f00001', slices: [{ id: 'S1', status: 'pending' }] },
		]);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(workspace, { recursive: true, force: true });
	});

	const pollsWhile = async (costOfAPollMs: number): Promise<number> => {
		const list = vi.spyOn(SafeWorkspaceReader.prototype, 'list');
		// Every reading of the clock is `costOfAPollMs` later than the one
		// before: a poll that reads it at its start and its end took that.
		let clock = 0;
		vi.spyOn(Date, 'now').mockImplementation(() => {
			clock += costOfAPollMs;
			return clock;
		});
		const listener = createSliceListener(
			workspace,
			'docs',
			{ kind: 'slice', onStatuses: ['done'] },
			async () => ({ ack: 'OK' }),
			POLL_MS,
		);
		await listener.start();
		await new Promise((resolve) => setTimeout(resolve, OBSERVED_MS));
		listener.stop();
		return list.mock.calls.length;
	};

	it('rests after a poll that took a second', async () => {
		// The poll at start, one more, and then the rest it earned.
		expect(await pollsWhile(1000)).toBeLessThanOrEqual(3);
	});

	it('keeps its interval when a poll costs nothing', async () => {
		expect(await pollsWhile(0)).toBeGreaterThan(5);
	});
});
