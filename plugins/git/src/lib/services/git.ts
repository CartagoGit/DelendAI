import { execFile } from 'node:child_process';

// f00065 slice F: the git-runner contract is single-sourced in core and
// re-exported here so this module's existing importers keep their import path.
// Only the contract is shared; the read-only runner implementation stays local.
export type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';
import type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';

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
				},
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

export const gitChanged = async (run: IGitRunner): Promise<readonly string[]> =>
	(await gitStatus(run)).entries.map((entry) => entry.path);

export const gitDiffStat = async (
	run: IGitRunner,
	options: { staged?: boolean; path?: string } = {},
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
	limit = 10,
): Promise<readonly IGitCommit[]> =>
	parseLog(
		(await run(['log', '-n', String(limit), '--pretty=format:%h\t%s']))
			.output,
	);

// ---------------------------------------------------------------------------
// blame (M33)
// ---------------------------------------------------------------------------

export interface IGitBlameLine {
	readonly line: number;
	readonly hash: string;
	readonly author: string;
	/** ISO date (YYYY-MM-DD), derived from the commit's author-time. */
	readonly date: string;
	readonly content: string;
}

export interface IGitBlameResult {
	readonly ok: boolean;
	readonly lines: readonly IGitBlameLine[];
	readonly reason?: string;
}

/**
 * Parse `git blame --porcelain` output. A commit's full metadata block
 * (author/author-time/…) only appears the FIRST time that commit is
 * mentioned; later lines from the same commit get just the short header
 * (`<sha> <orig-line> <final-line>`) followed directly by the content line —
 * so we cache each commit's author/date the first time we see it and reuse
 * it for the abbreviated repeats.
 */
export const parseBlamePorcelain = (raw: string): readonly IGitBlameLine[] => {
	const lines = raw.split('\n');
	const commits = new Map<string, { author: string; time: string }>();
	const out: IGitBlameLine[] = [];
	let i = 0;
	while (i < lines.length) {
		const header = lines[i] ?? '';
		const match = /^([0-9a-f]{40}) (\d+) (\d+)/.exec(header);
		if (!match) {
			i += 1;
			continue;
		}
		const hash = match[1] ?? '';
		const finalLine = Number(match[3]);
		i += 1;
		const cached = commits.get(hash);
		let author = cached?.author ?? '';
		let time = cached?.time ?? '';
		while (i < lines.length && !(lines[i] ?? '').startsWith('\t')) {
			const line = lines[i] ?? '';
			if (line.startsWith('author '))
				author = line.slice('author '.length);
			else if (line.startsWith('author-time '))
				time = line.slice('author-time '.length);
			i += 1;
		}
		if (author !== '' || time !== '') commits.set(hash, { author, time });
		const contentLine = lines[i] ?? '';
		out.push({
			line: finalLine,
			hash: hash.slice(0, 12),
			author,
			date:
				time !== ''
					? (new Date(Number(time) * 1000)
							.toISOString()
							.split('T')[0] ?? '')
					: '',
			content: contentLine.startsWith('\t')
				? contentLine.slice(1)
				: contentLine,
		});
		i += 1;
	}
	return out;
};

/** Per-line authorship for a tracked file. Optionally scoped to a line range. */
export const gitBlame = async (
	run: IGitRunner,
	path: string,
	options: { startLine?: number; endLine?: number } = {},
): Promise<IGitBlameResult> => {
	const args = ['blame', '--porcelain'];
	const hasStart = options.startLine !== undefined;
	const hasEnd = options.endLine !== undefined;
	if (hasStart !== hasEnd) {
		return {
			ok: false,
			lines: [],
			reason: 'startLine and endLine must be provided together',
		};
	}
	if (hasStart && hasEnd) {
		args.push('-L', `${options.startLine},${options.endLine}`);
	}
	args.push('--', path);
	const result = await run(args);
	if (!result.ok) {
		return {
			ok: false,
			lines: [],
			reason: result.reason ?? 'git blame failed',
		};
	}
	return { ok: true, lines: parseBlamePorcelain(result.output) };
};

// ---------------------------------------------------------------------------
// show (M33)
// ---------------------------------------------------------------------------

export interface IGitShowDetail {
	readonly hash: string;
	readonly author: string;
	readonly date: string;
	readonly subject: string;
	/** `--stat` summary (file/line change counts), not the full patch — stays low-token. */
	readonly stat: string;
}

export interface IGitShowResult {
	readonly ok: boolean;
	readonly detail?: IGitShowDetail;
	readonly reason?: string;
}

const SHOW_PRETTY_FORMAT = '%H%n%an%n%aI%n%s';

/**
 * Parse the exact output produced by `git show --stat
 * --pretty=format:%H%n%an%n%aI%n%s`. Git does not insert a blank line between
 * the custom pretty block and the stat, so the stat starts immediately after
 * line 4. Older fixtures did include a blank line; filtering only leading
 * blanks keeps both shapes valid while matching real git output.
 */
export const parseShowOutput = (raw: string): IGitShowDetail => {
	const lines = raw.split('\n');
	const [hash, author, date, subject] = lines;
	const stat = lines
		.slice(4)
		.filter((line, index) => index > 0 || line.trim() !== '')
		.join('\n')
		.trim();
	return {
		hash: hash ?? '',
		author: author ?? '',
		date: date ?? '',
		subject: subject ?? '',
		stat,
	};
};

/** Commit metadata + `--stat` summary for `ref` (optionally scoped to one path). Never the full patch. */
export const gitShow = async (
	run: IGitRunner,
	ref = 'HEAD',
	path?: string,
): Promise<IGitShowResult> => {
	const args = [
		'show',
		'--stat',
		`--pretty=format:${SHOW_PRETTY_FORMAT}`,
		ref,
	];
	if (path !== undefined) args.push('--', path);
	const result = await run(args);
	if (!result.ok) {
		return { ok: false, reason: result.reason ?? 'git show failed' };
	}
	return {
		ok: true,
		detail: parseShowOutput(result.output),
	};
};

// ---------------------------------------------------------------------------
// worktree list (M33) — read-only orientation. Creating/removing worktrees is
// `proposals_agent_worktree`'s job (per-agent lifecycle, `agent/<name>`
// branch convention); this just answers "what worktrees exist right now",
// agnostic of that convention, without duplicating its write path.
// ---------------------------------------------------------------------------

export interface IGitWorktreeEntry {
	readonly path: string;
	readonly head: string;
	readonly branch?: string;
	readonly bare?: boolean;
	readonly locked?: boolean;
}

/** Parse `git worktree list --porcelain` (blocks separated by a blank line). */
export const parseWorktreeList = (raw: string): readonly IGitWorktreeEntry[] =>
	raw
		.split('\n\n')
		.map((block) => block.trim())
		.filter((block) => block.length > 0)
		.map((block) => {
			let path = '';
			let head = '';
			let branch: string | undefined;
			let bare = false;
			let locked = false;
			for (const line of block.split('\n')) {
				if (line.startsWith('worktree ')) path = line.slice(9);
				else if (line.startsWith('HEAD ')) head = line.slice(5);
				else if (line.startsWith('branch '))
					branch = line.slice(7).replace('refs/heads/', '');
				else if (line === 'bare') bare = true;
				else if (line.startsWith('locked')) locked = true;
			}
			return {
				path,
				head,
				...(branch !== undefined ? { branch } : {}),
				...(bare ? { bare } : {}),
				...(locked ? { locked } : {}),
			};
		});

export const gitWorktreeList = async (
	run: IGitRunner,
): Promise<readonly IGitWorktreeEntry[]> =>
	parseWorktreeList((await run(['worktree', 'list', '--porcelain'])).output);
