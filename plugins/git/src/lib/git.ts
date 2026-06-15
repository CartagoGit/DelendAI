import { execFile } from 'node:child_process';

/**
 * Result of running a git subcommand. `ok` is true only when git ran
 * and exited 0; otherwise `reason` explains why (git missing, timeout,
 * stderr) so a caller can distinguish "clean repo" from "git unavailable"
 * instead of treating both as an empty string. [N3/N4]
 */
export interface IGitRunResult {
	readonly ok: boolean;
	readonly output: string;
	readonly reason?: string;
}

/** Runs a git subcommand asynchronously. Injectable for tests. */
export type IGitRunner = (args: readonly string[]) => Promise<IGitRunResult>;

/**
 * Default runner: invoke the real `git` in `cwd` (read-only commands)
 * via async `execFile`, so a slow/hanging git never blocks the MCP
 * server's event loop. Never throws: failures come back as
 * `{ ok: false, reason }`.
 */
export const createGitRunner =
	(cwd: string, timeoutMs = 15_000): IGitRunner =>
	(args) =>
		new Promise<IGitRunResult>((resolve) => {
			execFile(
				'git',
				[...args],
				{
					cwd,
					encoding: 'utf8',
					timeout: timeoutMs,
					maxBuffer: 8 * 1024 * 1024,
				},
				(error, stdout, stderr) => {
					if (!error) {
						resolve({ ok: true, output: stdout });
						return;
					}
					const err = error as NodeJS.ErrnoException & {
						killed?: boolean;
						signal?: string;
					};
					let reason: string;
					if (err.code === 'ENOENT') {
						reason = 'git is not installed or not on PATH';
					} else if (err.killed || err.signal === 'SIGTERM') {
						reason = `git timed out after ${timeoutMs}ms`;
					} else {
						reason =
							(stderr || err.message || 'git command failed')
								.trim()
								.split('\n')[0] ?? 'git command failed';
					}
					resolve({ ok: false, output: '', reason });
				}
			);
		});

export interface IRepoCheck {
	readonly ok: boolean;
	readonly reason?: string;
}

/**
 * Distinguish "git unavailable" from "not a git repo" from "clean repo".
 * Tools call this first and surface `reason` so an agent never mistakes a
 * missing git for a clean working tree.
 */
export const checkRepo = async (run: IGitRunner): Promise<IRepoCheck> => {
	const result = await run(['rev-parse', '--is-inside-work-tree']);
	if (!result.ok) {
		const reason = /not installed|not on PATH/i.test(result.reason ?? '')
			? 'git is not available here'
			: 'not a git repository';
		return { ok: false, reason };
	}
	return result.output.trim() === 'true'
		? { ok: true }
		: { ok: false, reason: 'not a git repository' };
};

export interface IGitStatusEntry {
	readonly status: string;
	readonly path: string;
}

export interface IGitStatus {
	readonly branch: string | undefined;
	readonly clean: boolean;
	readonly entries: readonly IGitStatusEntry[];
}

/** Parse `git status --porcelain=v1 --branch` output. */
export const parseStatus = (raw: string): IGitStatus => {
	const lines = raw.split('\n').filter((line) => line.length > 0);
	let branch: string | undefined;
	const entries: IGitStatusEntry[] = [];
	for (const line of lines) {
		if (line.startsWith('## ')) {
			branch = line.slice(3).split('...')[0]?.trim();
			continue;
		}
		entries.push({ status: line.slice(0, 2).trim(), path: line.slice(3) });
	}
	return { branch, clean: entries.length === 0, entries };
};

export const gitStatus = async (run: IGitRunner): Promise<IGitStatus> =>
	parseStatus((await run(['status', '--porcelain=v1', '--branch'])).output);

export const gitChanged = async (
	run: IGitRunner
): Promise<readonly string[]> =>
	(await gitStatus(run)).entries.map((entry) => entry.path);

export const gitDiffStat = async (
	run: IGitRunner,
	options: { staged?: boolean; path?: string } = {}
): Promise<string> => {
	const args = ['diff', '--stat'];
	if (options.staged === true) args.push('--cached');
	if (options.path !== undefined) args.push('--', options.path);
	return (await run(args)).output.trim();
};

export interface IGitCommit {
	readonly hash: string;
	readonly subject: string;
}

export const parseLog = (raw: string): readonly IGitCommit[] =>
	raw
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => {
			const [hash, ...rest] = line.split('\t');
			return { hash: hash ?? '', subject: rest.join('\t') };
		});

export const gitLog = async (
	run: IGitRunner,
	limit = 10
): Promise<readonly IGitCommit[]> =>
	parseLog(
		(await run(['log', '-n', String(limit), '--pretty=format:%h\t%s']))
			.output
	);
