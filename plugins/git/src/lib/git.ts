import { execFileSync } from 'node:child_process';

/** Runs a git subcommand and returns stdout. Injectable for tests. */
export type IGitRunner = (args: readonly string[]) => string;

/** Default runner: invoke the real `git` in `cwd` (read-only commands). */
export const createGitRunner =
	(cwd: string, timeoutMs = 15_000): IGitRunner =>
	(args) => {
		try {
			return execFileSync('git', [...args], {
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'ignore'],
				timeout: timeoutMs,
				maxBuffer: 8 * 1024 * 1024,
			});
		} catch {
			return '';
		}
	};

/**
 * Distinguish "not a git repo / git missing" from a clean repo (an
 * empty status would otherwise look identical). Tools call this first.
 */
export const isGitRepo = (run: IGitRunner): boolean =>
	run(['rev-parse', '--is-inside-work-tree']).trim() === 'true';

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

export const gitStatus = (run: IGitRunner): IGitStatus =>
	parseStatus(run(['status', '--porcelain=v1', '--branch']));

export const gitChanged = (run: IGitRunner): readonly string[] =>
	gitStatus(run).entries.map((entry) => entry.path);

export const gitDiffStat = (
	run: IGitRunner,
	options: { staged?: boolean; path?: string } = {}
): string => {
	const args = ['diff', '--stat'];
	if (options.staged === true) args.push('--cached');
	if (options.path !== undefined) args.push('--', options.path);
	return run(args).trim();
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

export const gitLog = (
	run: IGitRunner,
	limit = 10
): readonly IGitCommit[] =>
	parseLog(run(['log', '-n', String(limit), '--pretty=format:%h\t%s']));
