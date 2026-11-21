/**
 * project-failure-sink.service.ts — the store-backed sink (q00049 S1).
 *
 * Binds the failure collectors to the observation store of the project
 * rooted at `workspaceRoot`. Callers load it lazily: only a failure needs it.
 */
import { SafeWorkspaceReader } from '@delendai/core/runtime';

import type {
	IFailureSource,
	IObservationSink,
} from '../contracts/interfaces/observation.interface';
import type { IFailureReport } from '../contracts/interfaces/observation.interface';
import { appendObservations } from '../store/observation-store.service';
import { recordFailure } from './failure-collectors.service';

const STORE_REL = '.cache/delendai/self-learning/observations.jsonl';

/** The sink that appends to this project's own observation store. */
export const projectFailureSink = (workspaceRoot: string): IObservationSink => {
	const reader = new SafeWorkspaceReader(workspaceRoot);
	return (observations) =>
		appendObservations(
			{
				filePath: `${workspaceRoot}/${STORE_REL}`,
				workspaceRoot,
				readText: async (path) => {
					try {
						return (await reader.readText(path)).content;
					} catch {
						return null;
					}
				},
			},
			observations,
		);
};

/** Record a failure of the project at `workspaceRoot`. Never throws. */
export const recordProjectFailure = (
	workspaceRoot: string,
	source: IFailureSource,
	report: IFailureReport,
): Promise<void> =>
	recordFailure(projectFailureSink(workspaceRoot), source, report);
