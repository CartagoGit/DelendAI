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

import type { IHydrationWatch } from '../startup-reconciler/hydration-watch.interface';
import type { IStartCheckoutHydrationInput } from './start-checkout-hydration.interface';

export type { IStartCheckoutHydrationInput } from './start-checkout-hydration.interface';

export const startCheckoutHydration = (
	input: IStartCheckoutHydrationInput,
): IHydrationWatch =>
	startHydrationWatch({
		git: createStartupGitSeam(input.run),
		policy: input.policy,
		intervalMs: input.intervalMs ?? DEFAULT_HYDRATION_INTERVAL_MS,
		clock: { now: () => Date.now() },
		onTick: (tick) => {
			if (!tick.hydrated) return;
			input.onHydrated(
				tick.findings.map((item) => item.message).join(' '),
			);
		},
	});
