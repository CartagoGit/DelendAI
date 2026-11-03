/**
 * start-checkout-hydration.spec.ts — the one call a host makes to keep a
 * shared checkout level while it runs.
 *
 * Driven end to end against real git, through a real runner and the real
 * interval: this is the wiring a host actually gets, so a spec that
 * swapped in the seam or the clock would prove the parts and not the
 * assembly — and the assembly is this module's only job.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

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

const advanceTheForge = (from: IStartupOrigin): void => {
	const author = from.clone('author');
	author.write('src/alpha.ts', 'export const alpha = 2;\n');
	author.git('add', '-A');
	author.git('commit', '--quiet', '--no-verify', '-m', 'landed elsewhere');
	author.push('HEAD:refs/heads/develop');
};

describe('startCheckoutHydration', () => {
	it('moves a clean checkout the forge left behind, and says so once', async () => {
		origin = createStartupOrigin();
		const local = origin.clone('shared');
		advanceTheForge(origin);

		const messages: string[] = [];
		const watch = startCheckoutHydration({
			run: runnerFor(local.dir),
			policy: testPolicy(),
			intervalMs: 25,
			onHydrated: (message) => messages.push(message),
		});

		try {
			await vi.waitFor(
				() => {
					expect(messages.length).toBeGreaterThan(0);
				},
				{ timeout: 15_000, interval: 25 },
			);
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

	it("falls back to core's cadence when the host names none", () => {
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

	it('ends the finished units of the clone it was given, after a pass that ran', async () => {
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

		const ended: string[] = [];
		const watch = startCheckoutHydration({
			run: runnerFor(local.dir),
			policy,
			intervalMs: 25,
			root: local.dir,
			onHydrated: () => undefined,
			onUnitsEnded: (message) => ended.push(message),
		});
		try {
			await vi.waitFor(
				() => {
					expect(ended.length).toBeGreaterThan(0);
				},
				{ timeout: 15_000, interval: 25 },
			);
		} finally {
			watch.stop();
		}

		expect(ended[0]).toContain('ended 1 finished unit');
		expect(local.git('branch', '--list', unit).trim()).toBe('');
		expect(local.git('ls-remote', 'origin', unit).trim()).toBe('');
	});
});
