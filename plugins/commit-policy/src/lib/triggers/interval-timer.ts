/**
 * interval-timer.ts — single-shot helper used by `commit_policy_run`
 * to step the "every N minutes" cadence.
 *
 * x00264 (AUD-CP-006): the event carries the exact dirty paths
 * so the driver stages the same set that crossed the threshold.
 */

import type { IGitRunner } from '@mcp-vertex/core/public';

import { gitDirtyFilePaths } from '../services/git-extra';
import type { ITriggerEvent } from './trigger-types';

export interface IIntervalTimer {
	check(sinceMs: number): Promise<ITriggerEvent | null>;
	reset(): void;
}

export const createIntervalTimer = (
	run: IGitRunner,
	_config: { readonly minutes: number },
): IIntervalTimer => {
	let lastFiredAt: number | undefined;
	return {
		async check(sinceMs: number) {
			if (lastFiredAt !== undefined) {
				const elapsed = Date.now() - lastFiredAt;
				if (elapsed < sinceMs) return null;
			}
			const paths = await gitDirtyFilePaths(run);
			if (paths.length === 0) return null;
			lastFiredAt = Date.now();
			return {
				kind: 'interval',
				dirtyCount: paths.length,
				files: { paths },
			};
		},
		reset() {
			lastFiredAt = undefined;
		},
	};
};
