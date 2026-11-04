/**
 * git-read.helper.ts — the one synchronous git read.
 *
 * Thirty modules wrapped `execFileSync('git', …)` themselves, and they
 * disagreed on what a failure returns, whether output is trimmed and how
 * large it may be; all but a handful passed the environment through, so
 * inside a hook an inherited `GIT_DIR` made a read about another worktree
 * answer about the hook's. This read drops what a hook told git when the
 * command runs elsewhere, and answers `undefined` on any failure.
 */
import { execFileSync } from 'node:child_process';

import type { IGitReadOptions } from '../contracts/interfaces/git-read.interface';
import { gitEnvironmentFor } from './hook-free-environment.helper';

const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

/** Git's output (trimmed unless `verbatim`), or `undefined` when it failed. */
export const readGit = (
	cwd: string,
	args: readonly string[],
	options: IGitReadOptions = {},
): string | undefined => {
	try {
		const output = execFileSync('git', [...args], {
			cwd,
			env: gitEnvironmentFor(cwd),
			encoding: 'utf8',
			maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
			...(options.input === undefined
				? { stdio: ['ignore', 'pipe', 'ignore'] as const }
				: {
						input: options.input,
						stdio: ['pipe', 'pipe', 'ignore'] as const,
					}),
		});
		return options.verbatim === true ? output : output.trim();
	} catch {
		return undefined;
	}
};

/** Read-only git, output untouched (porcelain keeps its columns). */
export const gitVerbatim = (
	cwd: string,
	args: readonly string[],
	options: Omit<IGitReadOptions, 'verbatim'> = {},
): string | undefined => readGit(cwd, args, { ...options, verbatim: true });
