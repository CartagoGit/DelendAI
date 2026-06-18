import { execFile } from 'node:child_process';

/**
 * Result of running a git subcommand. `ok` is true only when git ran and
 * exited 0; otherwise `reason` explains why (git missing, timeout, stderr)
 * so a caller can distinguish "no worktrees" from "git unavailable".
 */
export interface IGitRunResult {
	readonly ok: boolean;
	readonly output: string;
	readonly reason?: string;
}

/** Runs a git subcommand asynchronously. Injectable for tests. */
export type IGitRunner = (args: readonly string[]) => Promise<IGitRunResult>;

/**
 * Default runner: invoke the real `git` in `cwd` via async `execFile`, so
 * a slow/hanging git never blocks the MCP server's event loop. Never
 * throws: failures come back as `{ ok: false, reason }`. Mirrors
 * `@mcp-vertex/git`'s runner; kept local so `proposals` stays loadable
 * standalone (no cross-plugin dependency for one helper).
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
