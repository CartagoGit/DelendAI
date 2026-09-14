/**
 * hydration-watch.spec.ts — the clone keeps up with the forge while the
 * server runs, not only at the instant it started.
 *
 * The complaint this pins, in the operator's words: the origin updates,
 * and locally nothing pulls when it does. It was measured twice in one
 * hour — the shared checkout
 * was brought level at boot and was four merges behind again before the
 * afternoon was out, because nothing local had any reason to look.
 *
 * The hydration half runs against REAL git (a bare origin and two
 * clones) for the same reason `checkout-freshness.spec` does: the claim
 * is about what git does to a working tree, and a stubbed seam would
 * happily "prove" whichever answer this file expected. The scheduling
 * half is driven through the injected schedule, so a year of ticks costs
 * a millisecond and none of it depends on a real clock.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	hydrateOnce,
	startHydrationWatch,
	type IHydrationSchedule,
	type IHydrationTick,
} from '@delendai/core/lib/startup-reconciler/hydration-watch';
import type {
	IGitOutcome,
	IStartupClock,
	IStartupGitSeam,
} from '@delendai/core/lib/startup-reconciler/seams.interface';

import { createStartupOrigin, type IStartupOrigin } from './startup-workspace';
import { testPolicy } from './fakes';

let origin: IStartupOrigin | undefined;

afterEach(() => {
	origin?.cleanup();
	origin = undefined;
});

const clock: IStartupClock = { now: () => 1_700_000_000_000 };

/** Advance the forge's `develop` from a second clone, as a merge would. */
const advanceTheForge = (from: IStartupOrigin): void => {
	const author = from.clone('author');
	author.write('src/alpha.ts', 'export const alpha = 2;\n');
	author.git('add', '-A');
	author.git('commit', '--quiet', '--no-verify', '-m', 'landed elsewhere');
	author.push('HEAD:refs/heads/develop');
};

describe('hydrateOnce, against real git', () => {
	it('pulls a clean checkout up to a branch that moved after it booted', async () => {
		origin = createStartupOrigin();
		// Clone FIRST: this machine holds the branch as it was, and only
		// afterwards does the forge absorb somebody else's pull request.
		// Cloning after the push would produce a checkout that is
		// trivially current and prove nothing.
		const local = origin.clone('shared');
		const before = local.git('rev-parse', 'HEAD').trim();

		advanceTheForge(origin);

		const tick = await hydrateOnce({
			git: local.seam,
			policy: testPolicy(),
			clock,
		});

		expect(tick.hydrated).toBe(true);
		expect(tick.findings.map((f) => f.code)).toContain('checkout.hydrated');
		// The claim is about the TREE, not about the report.
		expect(local.git('rev-parse', 'HEAD').trim()).not.toBe(before);
		expect(local.git('rev-parse', 'HEAD').trim()).toBe(
			local.git('rev-parse', 'origin/develop').trim(),
		);
	});

	it('does nothing, twice over, when the checkout is already level', async () => {
		origin = createStartupOrigin();
		const local = origin.clone('level');

		const first = await hydrateOnce({
			git: local.seam,
			policy: testPolicy(),
			clock,
		});
		const second = await hydrateOnce({
			git: local.seam,
			policy: testPolicy(),
			clock,
		});

		expect(first.hydrated).toBe(false);
		expect(second.hydrated).toBe(false);
		expect(first.findings.map((f) => f.code)).toContain(
			'checkout.on-integration',
		);
	});

	it('leaves a dirty tree exactly as found, and says how many files', async () => {
		origin = createStartupOrigin();
		const local = origin.clone('dirty');
		const before = local.git('rev-parse', 'HEAD').trim();
		advanceTheForge(origin);
		// Somebody's uncommitted work. A fast-forward would not delete
		// it, but it would move the ground under an edit whose author is
		// not here to agree.
		local.write('src/beta.ts', 'export const beta = 99;\n');

		const tick = await hydrateOnce({
			git: local.seam,
			policy: testPolicy(),
			clock,
		});

		expect(tick.hydrated).toBe(false);
		expect(tick.findings.map((f) => f.code)).toContain(
			'checkout.behind-integration',
		);
		expect(local.git('rev-parse', 'HEAD').trim()).toBe(before);
	});
});

/** A seam that answers, and counts how often it was asked. */
const countingSeam = (
	branch: string | undefined,
	onFetch: () => Promise<IGitOutcome>,
): IStartupGitSeam => ({
	fetch: onFetch,
	listRefs: async () => [],
	resolveRef: async () => undefined,
	describeRef: async () => undefined,
	isAncestor: async () => false,
	currentBranch: async () => branch,
	dirtyPaths: async () => [],
	headSha: async () => undefined,
	fastForward: async () => ({ ok: true }),
});

describe('hydrateOnce, when there is nothing to do', () => {
	it('skips with a reason when HEAD is not on the integration branch', async () => {
		// The normal state under a worktree-per-agent policy. A tick that
		// quietly did nothing would read exactly like a dead timer.
		const tick = await hydrateOnce({
			git: countingSeam('feature/x', async () => ({ ok: true })),
			policy: testPolicy(),
			clock,
		});

		expect(tick.hydrated).toBe(false);
		expect(tick.skipped).toContain('feature/x');
	});

	it('refuses to judge freshness when the fetch failed', async () => {
		// The remote-tracking ref did not move, so comparing the
		// checkout against it would call a stale copy of the forge
		// "level" — the exact wrong answer, arrived at confidently.
		const tick = await hydrateOnce({
			git: countingSeam('develop', async () => ({
				ok: false,
				reason: 'offline',
			})),
			policy: testPolicy(),
			clock,
		});

		expect(tick.hydrated).toBe(false);
		expect(tick.skipped).toContain('stale');
	});
});

describe('startHydrationWatch', () => {
	/** A schedule the spec drives by hand. */
	const manual = (): {
		readonly schedule: IHydrationSchedule;
		readonly fire: () => void;
		readonly cancelled: () => number;
	} => {
		let run: (() => void) | undefined;
		let cancels = 0;
		return {
			schedule: (fn) => {
				run = fn;
				return () => {
					cancels += 1;
				};
			},
			fire: () => run?.(),
			cancelled: () => cancels,
		};
	};

	it('reports every pass, including the ones that did nothing', async () => {
		const ticks: IHydrationTick[] = [];
		const driver = manual();
		const watch = startHydrationWatch({
			git: countingSeam('feature/x', async () => ({ ok: true })),
			policy: testPolicy(),
			intervalMs: 1000,
			clock,
			onTick: (tick) => ticks.push(tick),
			schedule: driver.schedule,
		});

		driver.fire();
		await Promise.resolve();
		await Promise.resolve();
		watch.stop();

		expect(ticks).toHaveLength(1);
		expect(ticks[0]?.skipped).toBeDefined();
	});

	it('never stacks passes when one is still in flight', async () => {
		// A slow fetch on a bad network would otherwise pile passes on
		// top of each other and turn a background refresh into a load
		// problem of its own.
		let fetches = 0;
		let release: (() => void) | undefined;
		const driver = manual();
		const watch = startHydrationWatch({
			git: countingSeam('develop', async () => {
				fetches += 1;
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return { ok: true };
			}),
			policy: testPolicy(),
			intervalMs: 1000,
			clock,
			onTick: () => undefined,
			schedule: driver.schedule,
		});

		driver.fire();
		await Promise.resolve();
		driver.fire();
		driver.fire();
		await Promise.resolve();

		expect(fetches).toBe(1);
		release?.();
		watch.stop();
	});

	it('stops once, however many times it is asked', async () => {
		const driver = manual();
		const watch = startHydrationWatch({
			git: countingSeam('develop', async () => ({ ok: true })),
			policy: testPolicy(),
			intervalMs: 1000,
			clock,
			onTick: () => undefined,
			schedule: driver.schedule,
		});

		watch.stop();
		watch.stop();

		expect(driver.cancelled()).toBe(1);
	});

	it('does not report a pass that finished after it was stopped', async () => {
		// Otherwise a server shutting down prints a hydration notice for
		// a tree nobody is watching any more.
		const ticks: IHydrationTick[] = [];
		const driver = manual();
		const watch = startHydrationWatch({
			git: countingSeam('feature/x', async () => ({ ok: true })),
			policy: testPolicy(),
			intervalMs: 1000,
			clock,
			onTick: (tick) => ticks.push(tick),
			schedule: driver.schedule,
		});

		driver.fire();
		watch.stop();
		await Promise.resolve();
		await Promise.resolve();

		expect(ticks).toHaveLength(0);
	});
});

describe('startHydrationWatch, on its own clock', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('ticks on the real interval when no schedule is injected, and stops it', async () => {
		// Every other case injects a schedule, so the timer a host
		// actually gets was never run by anything. This is that timer.
		vi.useFakeTimers();
		const ticks: IHydrationTick[] = [];
		const watch = startHydrationWatch({
			git: countingSeam('feature/x', async () => ({ ok: true })),
			policy: testPolicy(),
			intervalMs: 1000,
			clock,
			onTick: (tick) => ticks.push(tick),
		});

		await vi.advanceTimersByTimeAsync(1000);
		expect(ticks).toHaveLength(1);

		watch.stop();
		await vi.advanceTimersByTimeAsync(5000);
		// Stopped means the interval is gone, not merely ignored.
		expect(ticks).toHaveLength(1);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('startHydrationWatch, when a pass throws', () => {
	const throwingSeam = (): IStartupGitSeam => ({
		...countingSeam('develop', async () => ({ ok: true })),
		currentBranch: async () => {
			throw new Error('git vanished');
		},
	});

	const manualOnce = (): {
		readonly schedule: IHydrationSchedule;
		readonly fire: () => void;
	} => {
		let run: (() => void) | undefined;
		return {
			schedule: (fn) => {
				run = fn;
				return () => undefined;
			},
			fire: () => run?.(),
		};
	};

	const settle = async (): Promise<void> => {
		for (let i = 0; i < 5; i += 1) await Promise.resolve();
	};

	it('reports the failure as a tick instead of taking the server down', async () => {
		const ticks: IHydrationTick[] = [];
		const driver = manualOnce();
		const watch = startHydrationWatch({
			git: throwingSeam(),
			policy: testPolicy(),
			intervalMs: 1000,
			clock,
			onTick: (tick) => ticks.push(tick),
			schedule: driver.schedule,
		});

		driver.fire();
		await settle();
		watch.stop();

		expect(ticks).toHaveLength(1);
		expect(ticks[0]?.hydrated).toBe(false);
		expect(ticks[0]?.skipped).toContain('git vanished');
	});

	it('stays quiet about a failure that lands after stop()', async () => {
		const ticks: IHydrationTick[] = [];
		const driver = manualOnce();
		const watch = startHydrationWatch({
			git: throwingSeam(),
			policy: testPolicy(),
			intervalMs: 1000,
			clock,
			onTick: (tick) => ticks.push(tick),
			schedule: driver.schedule,
		});

		driver.fire();
		watch.stop();
		await settle();

		expect(ticks).toHaveLength(0);
	});

	it('runs the next pass after a failed one, rather than wedging', async () => {
		// `running` is released in `finally`. Without that, one thrown
		// pass would silently disable every later one — the dead-timer
		// failure this module exists to prevent.
		let calls = 0;
		const driver = manualOnce();
		const watch = startHydrationWatch({
			git: {
				...countingSeam('develop', async () => ({ ok: true })),
				currentBranch: async () => {
					calls += 1;
					throw new Error('flaky');
				},
			},
			policy: testPolicy(),
			intervalMs: 1000,
			clock,
			onTick: () => undefined,
			schedule: driver.schedule,
		});

		driver.fire();
		await settle();
		driver.fire();
		await settle();
		watch.stop();

		expect(calls).toBe(2);
	});
});
