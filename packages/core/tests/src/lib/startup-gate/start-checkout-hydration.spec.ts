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
});
