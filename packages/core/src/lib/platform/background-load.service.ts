/**
 * background-load.service.ts — background maintenance and proofs are
 * polite guests on the owner's machine.
 *
 * The maintenance chain ran at normal priority and every proof spread over
 * every core, while the owner worked on the same machine. Both now start at
 * the lowest OS priority and with half the cores, unless the environment
 * says otherwise (`DELENDAI_BACKGROUND_NICE`, `DELENDAI_BACKGROUND_WORKERS`).
 */
import { availableParallelism } from 'node:os';

import {
	BACKGROUND_DEFAULT_NICE,
	BACKGROUND_NICE_VARIABLE,
	BACKGROUND_WORKERS_VARIABLE,
} from '../contracts/constants/background-load.constant';
import type { ILowPriorityCommand } from '../contracts/interfaces/background-load.interface';

/** The niceness to run background work at, or `undefined` for none. */
export const backgroundNice = (
	env: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform,
): number | undefined => {
	if (platform === 'win32') return undefined;
	const wanted = env[BACKGROUND_NICE_VARIABLE];
	if (wanted === 'off') return undefined;
	const number = Number(wanted);
	return wanted !== undefined &&
		wanted !== '' &&
		Number.isInteger(number) &&
		number >= 0 &&
		number <= 19
		? number
		: BACKGROUND_DEFAULT_NICE;
};

/** How many workers background work and proofs may run side by side. */
export const backgroundWorkers = (
	env: NodeJS.ProcessEnv = process.env,
	cores: number = availableParallelism(),
): number => {
	const wanted = Number(env[BACKGROUND_WORKERS_VARIABLE]);
	return Number.isInteger(wanted) && wanted > 0
		? wanted
		: Math.max(1, Math.floor(cores / 2));
};

/** `command args` run through `nice`, or unchanged when nice is off. */
export const lowPriority = (
	command: string,
	args: readonly string[],
	env: NodeJS.ProcessEnv = process.env,
): ILowPriorityCommand => {
	const nice = backgroundNice(env);
	return nice === undefined || nice === 0
		? { command, args }
		: { command: 'nice', args: ['-n', String(nice), command, ...args] };
};

/**
 * The environment a background process gets: the caller's own, with the
 * parallelism of the proof and of vitest capped unless already chosen.
 */
export const backgroundEnv = (
	env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => {
	const workers = String(backgroundWorkers(env));
	return {
		...env,
		PROVE_PARALLEL: env.PROVE_PARALLEL ?? workers,
		VITEST_MAX_WORKERS: env.VITEST_MAX_WORKERS ?? workers,
	};
};

/** A shell command line run at background priority. */
export const lowPriorityShell = (
	commandLine: string,
	env: NodeJS.ProcessEnv = process.env,
): string => {
	const nice = backgroundNice(env);
	return nice === undefined || nice === 0
		? commandLine
		: `nice -n ${String(nice)} ${commandLine}`;
};
