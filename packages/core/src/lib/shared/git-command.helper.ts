/**
 * git-command.helper.ts — the one synchronous git command whose caller
 * branches on success and reports git's own words when it fails.
 *
 * Four modules carried this wrapper (publishing, local certification,
 * generated-file refresh, the merge driver), two of them with no
 * protection from a hook's `GIT_DIR`.
 */
import { execFileSync } from 'node:child_process';

import type {
	IGitCommandOptions,
	IGitCommandResult,
} from '../contracts/interfaces/git-command.interface';
import {
	gitEnvironmentFor,
	hookFreeEnvironment,
} from './hook-free-environment.helper';
import {
	noteGitSpawn,
	recallGitRead,
	rememberGitRead,
} from './git-read.helper';

const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

const stderrOf = (error: unknown): string =>
	typeof error === 'object' && error !== null && 'stderr' in error
		? String((error as { stderr?: unknown }).stderr ?? '').trim()
		: '';

export const runGitCommand = (
	cwd: string,
	args: readonly string[],
	options: IGitCommandOptions = {},
): IGitCommandResult => {
	const remembered = recallGitRead(cwd, args);
	if (remembered !== undefined) return { ok: true, out: remembered.trim() };
	noteGitSpawn(cwd, args);
	try {
		const output = execFileSync('git', [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
			env: {
				...(options.hookFree === true
					? hookFreeEnvironment()
					: gitEnvironmentFor(cwd)),
				...options.env,
			},
		});
		rememberGitRead(cwd, args, output);
		return { ok: true, out: output.trim() };
	} catch (error) {
		return { ok: false, out: stderrOf(error) };
	}
};
