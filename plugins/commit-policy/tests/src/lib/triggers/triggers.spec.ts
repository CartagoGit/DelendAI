/**
 * triggers.spec.ts — covers each trigger factory in isolation.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/public';

import { createThresholdTracker } from '@delendai/commit-policy/lib/triggers/threshold-tracker';
import { createIntervalTimer } from '@delendai/commit-policy/lib/triggers/interval-timer';
import { manualTrigger } from '@delendai/commit-policy/lib/triggers/manual-trigger';

const ok = (output: string): IGitRunResult => ({ ok: true, output });
const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

const buildRunner = (
	responses: ReadonlyMap<string, IGitRunResult>,
): IGitRunner => {
	const handler = (args: readonly string[]): Promise<IGitRunResult> => {
		const key = args.join('\u0000');
		const direct = responses.get(key);
		if (direct !== undefined) return Promise.resolve(direct);
		return Promise.resolve({
			ok: false,
			output: '',
			reason: 'not stubbed',
		});
	};
	return handler as IGitRunner;
};

const porcelainResponse = (files: readonly string[]): IGitRunResult => {
	if (files.length === 0) return ok('');
	const lines = files.map((f) => `?? ${f}`).join('\n');
	return ok(`${lines}\n`);
};

describe('threshold tracker', () => {
	it('fires once when the dirty count meets the threshold', async () => {
		const run = buildRunner(
			new Map([
				[
					'status\u0000--porcelain=v1',
					porcelainResponse(['a', 'b', 'c']),
				],
			]),
		);
		const tracker = createThresholdTracker(run, { files: 3 });
		const fired = await tracker.check();
		expect(fired?.kind).toBe('threshold');
		expect(fired?.dirtyCount).toBe(3);
	});

	it('does not fire below the threshold', async () => {
		const run = buildRunner(
			new Map([['status\u0000--porcelain=v1', porcelainResponse(['a'])]]),
		);
		const tracker = createThresholdTracker(run, { files: 3 });
		expect(await tracker.check()).toBeNull();
	});

	it('does not re-fire for the same count twice in a row', async () => {
		const run = buildRunner(
			new Map([
				[
					'status\u0000--porcelain=v1',
					porcelainResponse(['a', 'b', 'c']),
				],
			]),
		);
		const tracker = createThresholdTracker(run, { files: 3 });
		await tracker.check();
		expect(await tracker.check()).toBeNull();
	});

	it('refires when the count grows past the threshold', async () => {
		const response1 = porcelainResponse(['a', 'b', 'c']);
		const response2 = porcelainResponse(['a', 'b', 'c', 'd']);
		let toggle = 0;
		const handler = (args: readonly string[]): Promise<IGitRunResult> => {
			if (args[0] === 'status') {
				return Promise.resolve(toggle++ === 0 ? response1 : response2);
			}
			return Promise.resolve(fail('not stubbed'));
		};
		const tracking = handler as IGitRunner;
		const tracker = createThresholdTracker(tracking, { files: 3 });
		expect((await tracker.check())?.dirtyCount).toBe(3);
		expect((await tracker.check())?.dirtyCount).toBe(4);
	});
});

describe('interval timer', () => {
	it('refuses when no time has elapsed since the last fire', async () => {
		const run = buildRunner(
			new Map([['status\u0000--porcelain=v1', porcelainResponse(['a'])]]),
		);
		const timer = createIntervalTimer(run, { minutes: 30 });
		expect((await timer.check(30 * 60_000))?.kind).toBe('interval');
		expect(await timer.check(30 * 60_000)).toBeNull();
	});

	it('refuses when the worktree is clean', async () => {
		const run = buildRunner(
			new Map([['status\u0000--porcelain=v1', porcelainResponse([])]]),
		);
		const timer = createIntervalTimer(run, { minutes: 1 });
		expect(await timer.check(60_000)).toBeNull();
	});
});

describe('manual trigger', () => {
	it('returns a manual event', () => {
		expect(manualTrigger().kind).toBe('manual');
	});
});

describe('x00264 — non-slice triggers carry the dirty files they saw', () => {
	it('threshold event includes files.paths matching porcelain v1', async () => {
		const run = buildRunner(
			new Map([
				[
					'status\u0000--porcelain=v1',
					porcelainResponse(['a.ts', 'b.ts', 'c.ts']),
				],
			]),
		);
		const tracker = createThresholdTracker(run, { files: 3 });
		const fired = await tracker.check();
		expect(fired?.kind).toBe('threshold');
		expect(fired?.files?.paths).toEqual(['a.ts', 'b.ts', 'c.ts']);
	});

	it('threshold event strips rename arrow to the destination path', async () => {
		const run = buildRunner(
			new Map([
				[
					'status\u0000--porcelain=v1',
					ok('R  old-name.ts -> new-name.ts\n'),
				],
			]),
		);
		const tracker = createThresholdTracker(run, { files: 1 });
		const fired = await tracker.check();
		expect(fired?.files?.paths).toEqual(['new-name.ts']);
	});

	it('interval event includes files.paths matching porcelain v1', async () => {
		const run = buildRunner(
			new Map([
				['status\u0000--porcelain=v1', porcelainResponse(['one.ts'])],
			]),
		);
		const timer = createIntervalTimer(run, { minutes: 1 });
		const fired = await timer.check(60_000);
		expect(fired?.kind).toBe('interval');
		expect(fired?.files?.paths).toEqual(['one.ts']);
	});

	it('normalizes serialized rename paths in dirty status output', async () => {
		const run = buildRunner(
			new Map([
				[
					'status\u0000--porcelain=v1',
					ok(
						' M docs/mcp-vertex/proposals/ready/f00286-f00286.md -> docs/mcp-vertex/proposals/ready/f00286-migrated-work-item-f00286.md\n',
					),
				],
			]),
		);
		const timer = createIntervalTimer(run, { minutes: 1 });
		const fired = await timer.check(60_000);
		expect(fired?.files?.paths).toEqual([
			'docs/mcp-vertex/proposals/ready/f00286-migrated-work-item-f00286.md',
		]);
	});
});
