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

import type { IGitRunner } from '@delendai/core/public';

import { gitDirtyFilePaths } from '../services/git-extra';
import type { ThresholdEvent } from './trigger-types';

export interface IThresholdTracker {
	check(): Promise<ThresholdEvent | null>;
	reset(): void;
}

const toDirtySetKey = (paths: readonly string[]): string =>
	[...paths].sort().join('\u0000');

export const createThresholdTracker = (
	run: IGitRunner,
	config: { readonly files: number },
): IThresholdTracker => {
	let lastFiredSetKey: string | null = null;
	return {
		async check() {
			const paths = await gitDirtyFilePaths(run);
			const dirty = paths.length;
			if (dirty < config.files) {
				lastFiredSetKey = null;
				return null;
			}
			const dirtySetKey = toDirtySetKey(paths);
			if (dirtySetKey === lastFiredSetKey) return null;
			lastFiredSetKey = dirtySetKey;
			return {
				kind: 'threshold',
				dirtyCount: dirty,
				files: { paths },
			};
		},
		reset() {
			lastFiredSetKey = null;
		},
	};
};
