/**
 * threshold-tracker.ts — fires when the dirty file count meets
 * `config.files`. Manual-only trigger; called by `commit_policy_run`.
 */

import type { IGitRunner } from '@mcp-vertex/core/public';

import { gitDirtyFileCount } from '../services/git-extra';
import type { ITriggerEvent } from './trigger-types';

export interface IThresholdTracker {
	check(): Promise<ITriggerEvent | null>;
	reset(): void;
}

export const createThresholdTracker = (
	run: IGitRunner,
	config: { readonly files: number },
): IThresholdTracker => {
	let lastFiredCount = 0;
	return {
		async check() {
			const dirty = await gitDirtyFileCount(run);
			if (dirty >= config.files && dirty !== lastFiredCount) {
				lastFiredCount = dirty;
				return { kind: 'threshold', dirtyCount: dirty };
			}
			return null;
		},
		reset() {
			lastFiredCount = 0;
		},
	};
};
