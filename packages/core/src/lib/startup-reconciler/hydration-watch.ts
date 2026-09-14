/**
 * hydration-watch.ts — keep the shared checkout level with the forge for
 * as long as the server is up, not only at the instant it started.
 *
 * WHAT WAS MISSING, measured twice in one hour. The reconciler already
 * knew how to advance a checkout the forge had moved past, and did it at
 * boot. But a boot happens once, and pull requests land all afternoon:
 * minutes after the shared checkout was brought level it was four merges
 * behind again, and nothing local had any reason to notice. The operator
 * saw the branch move on the forge and not in their own clone, and said
 * so: the origin updates, and locally nothing pulls when it does.
 *
 * There is no event for this. Git has no hook that fires when a REMOTE
 * moves; the forge cannot push into a laptop. Something local has to
 * look, and the only long-lived local process is the server itself. So
 * the server looks — every `intervalMs`, for as long as it runs.
 *
 * WHAT IT MAY DO is deliberately not a new decision: it fetches with the
 * existing fetch phase and then asks the existing checkout phase, so a
 * tick can do exactly what a boot can do and nothing more — fast-forward
 * a clean tree that is merely behind, and otherwise report. The rules
 * about dirty trees, divergence and unpushed commits are stated once, in
 * `verify-checkout`, and this module gets them by calling it rather than
 * by agreeing with it.
 *
 * WHEN IT DOES NOTHING, and says so: HEAD not on the integration branch
 * is the normal state of a worktree-per-agent policy, and a tick that
 * quietly skipped would be indistinguishable from a dead timer.
 */

import type { IStartupFinding } from './contracts';
import { runFetchPhase } from './phases/fetch-refs';
import { runCheckoutPhase } from './phases/verify-checkout';

import type {
	IHydrationSchedule,
	IHydrationTick,
	IHydrationWatch,
	IHydrationWatchInput,
} from './hydration-watch.interface';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IStartupClock, IStartupGitSeam } from './seams.interface';

export type {
	IHydrationSchedule,
	IHydrationTick,
	IHydrationWatch,
	IHydrationWatchInput,
} from './hydration-watch.interface';

export { DEFAULT_HYDRATION_INTERVAL_MS } from './hydration-watch.constant';

const hydratedIn = (findings: readonly IStartupFinding[]): boolean =>
	findings.some((item) => item.code === 'checkout.hydrated');

const blockedIn = (findings: readonly IStartupFinding[]): boolean =>
	findings.some((item) => item.kind === 'blocker');

/**
 * One pass: fetch, then let the checkout phase decide.
 *
 * Exported on its own because it is the whole behaviour — the watch is
 * only a clock around it — and because a host that would rather hydrate
 * at its own moments (before publishing, say) should be able to call
 * this without starting a timer.
 */
export const hydrateOnce = async (input: {
	readonly git: IStartupGitSeam;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly clock: IStartupClock;
}): Promise<IHydrationTick> => {
	const expected = input.policy.branches.integration;
	const branch = await input.git.currentBranch();
	if (branch !== expected) {
		return {
			ranAt: input.clock.now(),
			findings: [],
			hydrated: false,
			skipped: `HEAD is on ${branch ?? 'a detached commit'}, not on ${expected}; nothing to hydrate here.`,
		};
	}

	const fetched = await runFetchPhase({
		git: input.git,
		integrationBranch: expected,
		workRefPrefix: input.policy.branches.workRefPrefix,
		publicationRefPrefix: input.policy.branches.publicationRefPrefix,
	});

	// A failed fetch means the remote-tracking ref did not move, so
	// judging freshness against it would compare the checkout to a stale
	// copy of the forge and conclude, wrongly, that it is level.
	if (blockedIn(fetched.findings)) {
		return {
			ranAt: input.clock.now(),
			findings: fetched.findings,
			hydrated: false,
			skipped: 'the fetch did not complete, so the remote view is stale.',
		};
	}

	const checkout = await runCheckoutPhase({
		git: input.git,
		policy: input.policy,
		// Empty by design: `refs` is only consulted when HEAD sits off
		// the integration branch, which the guard above has already
		// excluded. Passing a fabricated list would be the only way this
		// module could disagree with the phase it delegates to.
		refs: [],
	});

	return {
		ranAt: input.clock.now(),
		findings: checkout.findings,
		hydrated: hydratedIn(checkout.findings),
	};
};

const timerSchedule: IHydrationSchedule = (run, everyMs) => {
	const handle: unknown = setInterval(run, everyMs);
	// A background refresh must never be the reason a process stays
	// alive. `unref` is present on Node and Bun timers and absent in a
	// browser, so it is asked for rather than assumed.
	const unref = (handle as { unref?: () => void }).unref;
	if (typeof unref === 'function') unref.call(handle);
	return () => {
		clearInterval(handle as ReturnType<typeof setInterval>);
	};
};

/**
 * Start looking. Ticks never overlap: a slow fetch on a bad network
 * would otherwise stack passes on top of each other and turn a refresh
 * into a load problem.
 */
export const startHydrationWatch = (
	input: IHydrationWatchInput,
): IHydrationWatch => {
	const schedule = input.schedule ?? timerSchedule;
	let running = false;
	let stopped = false;

	const pass = (): void => {
		if (running || stopped) return;
		running = true;
		void hydrateOnce({
			git: input.git,
			policy: input.policy,
			clock: input.clock,
		})
			.then((tick) => {
				if (!stopped) input.onTick(tick);
			})
			.catch((error: unknown) => {
				// A background refresh may not take the server down. The
				// failure is reported through the same channel as every
				// other tick, so it is visible rather than swallowed.
				if (stopped) return;
				input.onTick({
					ranAt: input.clock.now(),
					findings: [],
					hydrated: false,
					skipped: `the pass threw: ${error instanceof Error ? error.message : String(error)}`,
				});
			})
			.finally(() => {
				running = false;
			});
	};

	const cancel = schedule(pass, input.intervalMs);
	return {
		stop: () => {
			if (stopped) return;
			stopped = true;
			cancel();
		},
	};
};
