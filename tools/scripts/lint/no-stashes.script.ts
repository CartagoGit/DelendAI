#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';

export interface IStashEntry {
	readonly ref: string;
	readonly message: string;
}

export const parseStashList = (output: string): readonly IStashEntry[] =>
	output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			const separator = line.indexOf('|');
			return separator === -1
				? { ref: line, message: '' }
				: {
						ref: line.slice(0, separator),
						message: line.slice(separator + 1),
					};
		});

export const formatStashPolicyError = (
	stashes: readonly IStashEntry[],
): string => {
	const details = stashes
		.map(({ ref, message }) =>
			message.length > 0 ? `${ref}: ${message}` : ref,
		)
		.join('\n');
	return [
		'stash policy violation: git stashes are forbidden in this repository.',
		'Reconcile each stash by applying and committing useful work, or drop it after review:',
		details,
	].join('\n');
};

export const runNoStashesCheck = (): number => {
	const result = spawnSync('git', ['stash', 'list', '--format=%gd|%gs'], {
		encoding: 'utf8',
	});
	if (result.status !== 0) {
		console.error('stash policy check could not inspect git stash list.');
		return result.status ?? 1;
	}

	const stashes = parseStashList(result.stdout ?? '');
	if (stashes.length > 0) {
		console.error(formatStashPolicyError(stashes));
		return 1;
	}

	console.log('stash policy: clean');
	return 0;
};

if (import.meta.main) process.exit(runNoStashesCheck());
