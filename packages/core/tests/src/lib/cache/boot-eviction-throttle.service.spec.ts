import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	isBootSweepDue,
	runThrottledBootSweep,
} from '@delendai/core/lib/cache/boot-eviction-throttle.service';
import { CACHE_EVICTION_STAMP_PATH } from '@delendai/core/lib/contracts/constants/cache-layout.constant';
import type {
	ICacheEvictionRegistry,
	ICacheEvictionReport,
} from '@delendai/core/lib/contracts/interfaces/cache-eviction.interface';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const DAY_MS = 24 * 60 * 60 * 1000;
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) removeTestWorkspace(root);
});

const report = (dryRun: boolean): ICacheEvictionReport => ({
	dryRun,
	appliedAt: 'x',
	totalBytes: 0,
	removed: [],
	skipped: [],
	errors: [],
	rulesEvaluated: 3,
});

const fakeRegistry = () => {
	const runs: boolean[] = [];
	const registry: ICacheEvictionRegistry = {
		register: () => undefined,
		unregister: () => false,
		list: () => [],
		run: async (options) => {
			runs.push(options?.dryRun ?? true);
			return report(options?.dryRun ?? true);
		},
	};
	return { registry, runs };
};

describe('isBootSweepDue', () => {
	it('is due every boot without an interval', () => {
		expect(
			isBootSweepDue({ lastAt: 5, now: 6, intervalMs: undefined }),
		).toBe(true);
		expect(isBootSweepDue({ lastAt: 5, now: 6, intervalMs: 0 })).toBe(true);
	});

	it('waits out the interval and runs once it has passed', () => {
		expect(
			isBootSweepDue({ lastAt: 0, now: DAY_MS - 1, intervalMs: DAY_MS }),
		).toBe(false);
		expect(
			isBootSweepDue({ lastAt: 0, now: DAY_MS, intervalMs: DAY_MS }),
		).toBe(true);
	});

	it('runs when nothing was recorded or the clock went back', () => {
		expect(
			isBootSweepDue({ lastAt: null, now: 1, intervalMs: DAY_MS }),
		).toBe(true);
		expect(isBootSweepDue({ lastAt: 99, now: 1, intervalMs: DAY_MS })).toBe(
			true,
		);
	});
});

describe('runThrottledBootSweep', () => {
	const setup = () => {
		const root = createTestWorkspace('delendai-throttle-');
		roots.push(root);
		return root;
	};

	it('leaves the workspace alone when no interval is configured', async () => {
		const root = setup();
		const { registry, runs } = fakeRegistry();
		await runThrottledBootSweep({
			registry,
			workspaceRoot: root,
			dryRun: false,
			intervalMs: undefined,
		});
		expect(runs).toEqual([false]);
		await expect(
			readFile(join(root, ...CACHE_EVICTION_STAMP_PATH), 'utf8'),
		).rejects.toThrow();
	});

	it('skips a dry run inside the interval and runs again after a virtual day', async () => {
		const root = setup();
		const { registry, runs } = fakeRegistry();
		let clock = 1_000;
		const sweep = (dryRun: boolean) =>
			runThrottledBootSweep({
				registry,
				workspaceRoot: root,
				dryRun,
				intervalMs: DAY_MS,
				now: () => clock,
			});
		await sweep(true);
		clock += 1_000;
		const skipped = await sweep(true);
		expect(runs).toEqual([true]);
		expect(skipped.rulesEvaluated).toBe(0);
		clock += DAY_MS;
		await sweep(true);
		expect(runs).toEqual([true, true]);
	});

	it('does not stamp when the sweep throws, so the next boot retries', async () => {
		const root = setup();
		const registry: ICacheEvictionRegistry = {
			register: () => undefined,
			unregister: () => false,
			list: () => [],
			run: async () => {
				throw new Error('boom');
			},
		};
		await expect(
			runThrottledBootSweep({
				registry,
				workspaceRoot: root,
				dryRun: true,
				intervalMs: DAY_MS,
			}),
		).rejects.toThrow('boom');
		await expect(
			readFile(join(root, ...CACHE_EVICTION_STAMP_PATH), 'utf8'),
		).rejects.toThrow();
	});
});
