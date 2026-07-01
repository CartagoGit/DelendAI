import { execFile } from 'node:child_process';

// f00065 slice F: the git-runner contract is single-sourced in core and
// re-exported here so this module's existing importers keep their import path.
// Only the contract is shared; the runner implementation below stays local so
// `proposals` remains loadable without depending on the `git` plugin.
export type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';
import type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';

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
				},
			);
		});
