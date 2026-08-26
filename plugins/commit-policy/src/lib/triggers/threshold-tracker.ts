/**
 * threshold-tracker.ts — fires when the dirty file count meets
 * `config.files`. Manual-only trigger; called by `commit_policy_run`.
 *
 * x00264 (AUD-CP-006): the trigger carries the exact set of
 * dirty paths in the event so the driver stages the same files
 * that crossed the threshold. The previous behaviour emitted
 * `files: []` (implicit skipAdd), which broke the
 * "predicate = action" invariant.
 */

import type { IGitRunner } from '@mcp-vertex/core/public';

import { gitDirtyFilePaths } from '../services/git-extra';
import type { ITriggerEvent } from './trigger-types';

export interface IThresholdTracker {
	check(): Promise<ITriggerEvent | null>;
	reset(): void;
}

export const createThresholdTracker = (
	run: IGitRunner,
	config: { readonly files: number },
): IThresholdTracker => {
	let lastFiredCount = -1;
	return {
		async check() {
			const paths = await gitDirtyFilePaths(run);
			const dirty = paths.length;
			if (dirty >= config.files && dirty !== lastFiredCount) {
				lastFiredCount = dirty;
				return {
					kind: 'threshold',
					dirtyCount: dirty,
					files: { paths },
				};
			}
			return null;
		},
		reset() {
			lastFiredCount = -1;
		},
	};
};
