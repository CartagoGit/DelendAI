/**
 * interval-timer.ts — single-shot helper used by `commit_policy_run`
 * to step the "every N minutes" cadence.
 */

import type { IGitRunner } from '@mcp-vertex/core/public';

import { gitDirtyFileCount } from '../services/git-extra';
import type { ITriggerEvent } from './trigger-types';

export interface IIntervalTimer {
	check(sinceMs: number): Promise<ITriggerEvent | null>;
	reset(): void;
}

export const createIntervalTimer = (
	run: IGitRunner,
	config: { readonly minutes: number },
): IIntervalTimer => {
	let lastFiredAt: number | undefined;
	return {
		async check(sinceMs: number) {
			if (lastFiredAt !== undefined) {
				const elapsed = Date.now() - lastFiredAt;
				if (elapsed < sinceMs) return null;
			}
			const dirty = await gitDirtyFileCount(run);
			if (dirty === 0) return null;
			lastFiredAt = Date.now();
			return { kind: 'interval', dirtyCount: dirty };
		},
		reset() {
			lastFiredAt = undefined;
		},
	};
};
