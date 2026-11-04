/**
 * model-outcome-store.service.ts — one record of how each model did, in
 * one append-only store every component that learns or ranks reads.
 *
 * `auto-agent-selector` kept a calibration log of `{providerId, success,
 * taskType}`, the runner a journal of hop states, and `prompt-eval` said
 * it wrote win rates nobody wrote: three histories, none enough to say
 * which model does a kind of task best for what is left to spend. A line
 * in the old calibration shape is read as an outcome (accepted or
 * rejected, cost unknown), so what was learned before carries over.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MODEL_OUTCOMES_RELATIVE_PATH } from '../contracts/constants/model-outcomes.constant';
import type {
	IModelOutcome,
	IModelOutcomeStore,
	IModelOutcomeVerdict,
} from '../contracts/interfaces/model-outcome.interface';
import { writeFileAtomic } from './atomic-write';
import { redactSecrets } from './redact';
import { withFileMutex } from './with-file-mutex';

const VERDICTS: ReadonlySet<IModelOutcomeVerdict> = new Set([
	'accepted',
	'rejected',
	'failed',
	'unknown',
]);

/** One stored line as an outcome: the current shape, or the calibration one. */
export const outcomeOfLine = (value: unknown): IModelOutcome | undefined => {
	if (value === null || typeof value !== 'object') return undefined;
	const line = value as Record<string, unknown>;
	if (typeof line.providerId !== 'string') return undefined;
	if (
		typeof line.outcome === 'string' &&
		VERDICTS.has(line.outcome as IModelOutcomeVerdict)
	) {
		return {
			...(line as unknown as IModelOutcome),
			at: typeof line.at === 'string' ? line.at : '',
		};
	}
	if (typeof line.success === 'boolean') {
		return {
			providerId: line.providerId,
			...(typeof line.taskType === 'string'
				? { taskKind: line.taskType }
				: {}),
			outcome: line.success ? 'accepted' : 'rejected',
			at: typeof line.ts === 'string' ? line.ts : '',
		};
	}
	return undefined;
};

/** The outcome store of the cache directory at `cacheDirAbs`. */
export const modelOutcomeStoreAt = (
	cacheDirAbs: string,
): IModelOutcomeStore => {
	const file = join(cacheDirAbs, MODEL_OUTCOMES_RELATIVE_PATH);
	const readAll = async (): Promise<IModelOutcome[]> => {
		let raw: string;
		try {
			raw = await readFile(file, 'utf8');
		} catch {
			return [];
		}
		return raw.split('\n').flatMap((text) => {
			if (text.trim().length === 0) return [];
			try {
				const outcome = outcomeOfLine(JSON.parse(text));
				return outcome === undefined ? [] : [outcome];
			} catch {
				// One malformed line from an interrupted build keeps the rest.
				return [];
			}
		});
	};
	return {
		append: async (outcome) => {
			// The task kind is caller-supplied free text reaching a durable,
			// re-surfaced log: it is redacted like everything else written.
			const line = redactSecrets(
				JSON.stringify({
					...outcome,
					at: outcome.at ?? new Date().toISOString(),
				}),
			).text;
			await withFileMutex(file, async () => {
				let before = '';
				try {
					before = await readFile(file, 'utf8');
				} catch {
					before = '';
				}
				const joined =
					before.length === 0 || before.endsWith('\n')
						? before
						: `${before}\n`;
				await writeFileAtomic(file, `${joined}${line}\n`);
			});
		},
		readAll,
	};
};
