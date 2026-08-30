import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';

import { createThresholdTracker } from '@mcp-vertex/commit-policy/lib/triggers/threshold-tracker';

const ok = (output: string): IGitRunResult => ({ ok: true, output });

const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

const buildRunner = (
	handler: (args: readonly string[]) => Promise<IGitRunResult>,
): IGitRunner => handler as IGitRunner;

describe('threshold tracker', () => {
	it('does not fire when only two dirty files remain under threshold 3', async () => {
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			return Promise.resolve(ok(' M a.ts\n?? b.ts\nA  staged-only.ts\n'));
		});
		const tracker = createThresholdTracker(run, { files: 3 });
		expect(await tracker.check()).toBeNull();
	});

	it('fires with exactly the three dirty files that reach threshold 3', async () => {
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			return Promise.resolve(
				ok(' M alpha.ts\nMM beta.ts\n?? gamma.ts\nA  staged-only.ts\n'),
			);
		});
		const tracker = createThresholdTracker(run, { files: 3 });
		const fired = await tracker.check();
		expect(fired).toEqual({
			kind: 'threshold',
			dirtyCount: 3,
			files: { paths: ['alpha.ts', 'beta.ts', 'gamma.ts'] },
		});
	});

	it('refires with all four dirty files when the dirty set grows', async () => {
		const responses: readonly [IGitRunResult, IGitRunResult] = [
			ok(' M alpha.ts\n M beta.ts\n?? gamma.ts\n'),
			ok(' M alpha.ts\n M beta.ts\n?? gamma.ts\nMM delta.ts\n'),
		];
		let index = 0;
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			const next = index === 0 ? responses[0] : responses[1];
			index += 1;
			return Promise.resolve(next);
		});
		const tracker = createThresholdTracker(run, { files: 3 });
		expect(await tracker.check()).toEqual({
			kind: 'threshold',
			dirtyCount: 3,
			files: { paths: ['alpha.ts', 'beta.ts', 'gamma.ts'] },
		});
		expect(await tracker.check()).toEqual({
			kind: 'threshold',
			dirtyCount: 4,
			files: { paths: ['alpha.ts', 'beta.ts', 'gamma.ts', 'delta.ts'] },
		});
	});

	it('excludes unrelated staged-only files from event.files', async () => {
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			return Promise.resolve(
				ok(
					'A  staged-a.ts\n M alpha.ts\n?? beta.ts\n D gamma.ts\nM  staged-b.ts\n',
				),
			);
		});
		const tracker = createThresholdTracker(run, { files: 3 });
		const fired = await tracker.check();
		expect(fired?.files?.paths).toEqual([
			'alpha.ts',
			'beta.ts',
			'gamma.ts',
		]);
		expect(fired?.dirtyCount).toBe(3);
	});

	it('extracts the destination from a rename with a mixed status', async () => {
		const run = buildRunner((args) => {
			if (args[0] !== 'status')
				return Promise.resolve(fail('not stubbed'));
			return Promise.resolve(
				ok('RM docs/old.md -> docs/new.md\n M src/index.ts\n'),
			);
		});
		const tracker = createThresholdTracker(run, { files: 2 });
		const fired = await tracker.check();

		expect(fired).toEqual({
			kind: 'threshold',
			dirtyCount: 2,
			files: { paths: ['docs/new.md', 'src/index.ts'] },
		});
	});
});
