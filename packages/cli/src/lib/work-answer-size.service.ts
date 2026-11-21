/**
 * work-answer-size.service.ts — how long `work enter|prove|deliver|publish`
 * answer a human or an agent that did not ask for the whole record.
 *
 * Every agent reads these answers into its context: a delivery printed a
 * large JSON record and a failed gate its whole chatter. By default the
 * answer is the result (the pull request, the proof's verdict) or, on
 * failure, the last lines of the failing gate; the full record is written to
 * a log file whose path is printed, and `--verbose` prints it all. Machine
 * callers (`--json`) always get the structured result unchanged.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	FAILURE_LINES,
	LOG_DIR,
	SUMMARY_KEYS,
} from '../contracts/constants/work-answer-size.constant';
import type { ICliCommandResult } from '../contracts/interfaces/cli-command.interface';
import type { IAnswerSizeInput } from '../contracts/interfaces/work-answer-size.interface';
import { isRecord } from './helpers/cli-command.helper';

const writeRecord = (cwd: string, verb: string, body: string): string => {
	const file = join(cwd, ...LOG_DIR, `work-${verb}.log`);
	try {
		mkdirSync(join(cwd, ...LOG_DIR), { recursive: true });
		writeFileSync(file, `${body}\n`);
	} catch {
		// An unwritable log must not turn an answer into a crash.
	}
	return file;
};

const tailOf = (text: string): string =>
	text.trimEnd().split('\n').slice(-FAILURE_LINES).join('\n');

const scalarsOf = (value: unknown): readonly string[] =>
	isRecord(value)
		? SUMMARY_KEYS.flatMap((key) => {
				const field = value[key];
				return typeof field === 'string' || typeof field === 'number'
					? [`${key} ${String(field)}`]
					: [];
			})
		: [];

/** The few lines a successful answer keeps; undefined when there is nothing to shrink to. */
const summaryOf = (verb: string, data: unknown): string | undefined => {
	if (!isRecord(data)) return undefined;
	if (typeof data.output === 'string') return tailOf(data.output);
	if (verb === 'deliver') {
		return [
			`delivered ${String(data.delivered ?? 'review')}`,
			...scalarsOf(data.pullRequest),
		].join('\n');
	}
	if (verb === 'prove') {
		return [
			`proved ${String(data.proved)}${data.remembered === true ? ' (remembered)' : ''}`,
			...(Array.isArray(data.baseFailures) && data.baseFailures.length > 0
				? [`base failures ${data.baseFailures.length}`]
				: []),
		].join('\n');
	}
	if (verb === 'publish') {
		const lines = [
			...scalarsOf(data),
			...scalarsOf(data.pullRequest),
			...scalarsOf(data.publication),
		];
		return lines.length === 0 ? undefined : lines.join('\n');
	}
	return undefined;
};

/** The answer, small unless the caller asked for the record or for JSON. */
export const sizedAnswer = (input: IAnswerSizeInput): ICliCommandResult => {
	const { verb, result, verbose, json, cwd } = input;
	if (verbose || json) return result;
	if (result.code !== 0) {
		const error = result.error ?? '';
		if (error.split('\n').length <= FAILURE_LINES) return result;
		const file = writeRecord(cwd, verb, error);
		return {
			...result,
			error: `${tailOf(error)}\nfull record: ${file} (or --verbose)`,
		};
	}
	const summary = summaryOf(verb, result.data);
	if (summary === undefined) return result;
	const file = writeRecord(
		cwd,
		verb,
		JSON.stringify(result.data, undefined, 2),
	);
	return {
		code: result.code,
		text: `${summary}\nfull record: ${file} (or --verbose)\n`,
	};
};
