/**
 * start-checkout-hydration.spec.ts — the one call a host makes to keep a
 * shared checkout level while it runs.
 *
 * Driven end to end against real git, through a real runner and the real
 * watch: this is the wiring a host actually gets, so a spec that swapped in
 * the seam would prove the parts and not the assembly — and the assembly is
 * this module's only job. Only the interval is fake: a real one kept
 * fetching every 25 ms while the pass under test worked, and one case took
 * 7 s on CI.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { type IFakeClock, useFakeClock } from '@delendai/test-kit';

import { startCheckoutHydration } from '@delendai/core/lib/startup-gate/start-checkout-hydration';
import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';

import {
	createStartupOrigin,
	runnerFor,
	type IStartupOrigin,
} from '../startup-reconciler/startup-workspace';
import { testPolicy } from '../startup-reconciler/fakes';

let origin: IStartupOrigin | undefined;

afterEach(() => {
	origin?.cleanup();
	origin = undefined;
});

const INTERVAL_MS = 25;

/** Fake only the interval the watch schedules on; git and its I/O stay real. */
const fakeInterval = (): IFakeClock =>
	useFakeClock({ toFake: ['setInterval', 'clearInterval'] });

/** Counts the passes the watch starts: it asks `standDown` before each one. */
const passCounter = () => {
	let started = 0;
	return {
		standDown: (): Promise<undefined> => {
			started += 1;
			return Promise.resolve(undefined);
		},
		started: (): number => started,
	};
};

/**
 * Move the clock an interval at a time until `count` passes have started.
 * Passes never overlap, so the start of pass n means pass n - 1 has
 * reported its tick.
 */
const runUntilStarted = async (
	clock: IFakeClock,
	passes: { readonly started: () => number },
	count: number,
): Promise<void> => {
	while (passes.started() < count) {
		clock.advance(INTERVAL_MS);
		await new Promise((resolve) => setImmediate(resolve));
	}
};

const advanceTheForge = (from: IStartupOrigin): void => {
	const author = from.clone('author');
	author.write('src/alpha.ts', 'export const alpha = 2;\n');
	author.git('add', '-A');
	author.git('commit', '--quiet', '--no-verify', '-m', 'landed elsewhere');
	author.push('HEAD:refs/heads/develop');
};

describe('startCheckoutHydration', () => {
	it('[<1400ms] moves a clean checkout the forge left behind, and says so once', async () => {
		origin = createStartupOrigin();
		const local = origin.clone('shared');
		advanceTheForge(origin);

		const clock = fakeInterval();
		const passes = passCounter();
		const messages: string[] = [];
		const watch = startCheckoutHydration({
			run: runnerFor(local.dir),
			policy: testPolicy(),
			intervalMs: INTERVAL_MS,
			standDown: passes.standDown,
			onHydrated: (message) => messages.push(message),
		});

		try {
			// The third pass starting means the first two have reported.
			await runUntilStarted(clock, passes, 3);
		} finally {
			watch.stop();
		}

		expect(local.git('rev-parse', 'HEAD').trim()).toBe(
			local.git('rev-parse', 'origin/develop').trim(),
		);
		// Only a pass that MOVED the tree is reported: every later pass
		// finds it level and a host's log is not a heartbeat monitor.
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('fast-forwarded');
	});

	it("[<470ms] falls back to core's cadence when the host names none", () => {
		origin = createStartupOrigin();
		const local = origin.clone('default');

		const watch = startCheckoutHydration({
			run: runnerFor(local.dir),
			policy: testPolicy(),
			onHydrated: () => undefined,
		});

		// Starting and stopping must be safe with no interval supplied;
		// the default is core's decision, not something each host
		// re-derives.
		expect(() => watch.stop()).not.toThrow();
	});

	it('[<2100ms] ends the finished units of the clone it was given, after a pass that ran', async () => {
		origin = createStartupOrigin();
		const local = origin.clone('maintainer');
		const policy = testPolicy();
		const unit = `${policy.branches.workRefPrefix.replace(/^(refs\/)?(heads\/)?/u, '')}reviewer/review/i00002-all-g1/verdicts`;
		local.git('checkout', '--quiet', '-b', unit);
		await recordUnitEntered({
			cwd: local.dir,
			ref: unit,
			owner: { agent: 'reviewer', session: 's' },
			worktree: null,
			now: Math.floor(Date.now() / 1000) - 90 * 60,
		});
		local.write('verdict.md', 'approved\n');
		local.git('add', '-A');
		local.git('commit', '--quiet', '--no-verify', '-m', 'verdict');
		local.push(unit);
		local.git('checkout', '--quiet', 'develop');
		local.git(
			'merge',
			'--quiet',
			'--no-ff',
			'--no-verify',
			'-m',
			'land',
			unit,
		);
		local.push('develop');

		const clock = fakeInterval();
		let reportEnded: (message: string) => void = () => undefined;
		const ended = new Promise<string>((resolve) => {
			reportEnded = resolve;
		});
		const watch = startCheckoutHydration({
			run: runnerFor(local.dir),
			policy,
			intervalMs: INTERVAL_MS,
			root: local.dir,
			onHydrated: () => undefined,
			onUnitsEnded: (message) => reportEnded(message),
		});
		let message: string;
		try {
			// One pass, and only one: the end pass follows the pass that ran.
			clock.advance(INTERVAL_MS);
			message = await ended;
		} finally {
			watch.stop();
		}

		expect(message).toContain('ended 1 finished unit');
		expect(local.git('branch', '--list', unit).trim()).toBe('');
		expect(local.git('ls-remote', 'origin', unit).trim()).toBe('');
	});
});
