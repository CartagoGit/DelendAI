/**
 * start-checkout-hydration.ts — the host-facing way to keep a shared
 * checkout level with the forge while the server runs.
 *
 * WHY this wrapper exists rather than exporting the watch itself: a host
 * has a git runner and a resolved policy, and nothing else. Making it
 * assemble a git seam first would publish three symbols to say one
 * thing, and would put the assembly of a seam — which is core's
 * business, and changes when the seam does — into every host that ever
 * wants a background refresh.
 *
 * It sits next to `run-startup-gate` for the same reason that module
 * does: the boot-time call site of the reconciler is host-independent
 * behaviour, and so is the call site that keeps looking afterwards.
 */

import { createStartupGitSeam } from '../startup-reconciler/git-seam';
import {
	DEFAULT_HYDRATION_INTERVAL_MS,
	startHydrationWatch,
} from '../startup-reconciler/hydration-watch';

import { endFinishedUnits } from '../work-units/finished-units-end.service';

import type { IHydrationWatch } from '../startup-reconciler/hydration-watch.interface';
import type { IStartCheckoutHydrationInput } from './start-checkout-hydration.interface';

export type { IStartCheckoutHydrationInput } from './start-checkout-hydration.interface';

/**
 * End the finished units of `root` — the pass that only delendai's own
 * repository used to run, now run by whichever server holds the lease,
 * in every project. Never fatal: a unit left for the next pass is a
 * thing to report, not a reason to stop serving.
 */
const endUnitsAfterPass = async (
	input: IStartCheckoutHydrationInput,
	root: string,
): Promise<void> => {
	try {
		const ended = (
			await endFinishedUnits({ root, policy: input.policy, apply: true })
		).filter((unit) => unit.outcome === 'ended');
		if (ended.length === 0) return;
		input.onUnitsEnded?.(
			`ended ${String(ended.length)} finished unit(s) the integration branch holds, tips kept: ${ended.map((unit) => unit.unit).join(', ')}`,
		);
	} catch (error) {
		input.onUnitsEnded?.(
			`finished units were not ended: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};

export const startCheckoutHydration = (
	input: IStartCheckoutHydrationInput,
): IHydrationWatch => {
	// One end pass at a time: a slow one is not stacked under the next.
	let ending = false;
	const endUnits = (root: string): void => {
		if (ending) return;
		ending = true;
		void endUnitsAfterPass(input, root).finally(() => {
			ending = false;
		});
	};
	return startHydrationWatch({
		git: createStartupGitSeam(input.run),
		policy: input.policy,
		intervalMs: input.intervalMs ?? DEFAULT_HYDRATION_INTERVAL_MS,
		clock: { now: () => Date.now() },
		schedule: input.schedule,
		standDown: input.standDown,
		onTick: (tick) => {
			// Only after a pass that ran: held the lease and fetched, so
			// the remote view the units are judged against is current.
			if (tick.skipped === undefined && input.root !== undefined)
				endUnits(input.root);
			if (!tick.hydrated) return;
			input.onHydrated(
				tick.findings.map((item) => item.message).join(' '),
			);
		},
	});
};
