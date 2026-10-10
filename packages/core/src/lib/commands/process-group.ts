import { spawn } from 'node:child_process';

/**
 * Kill a spawned command's whole PROCESS GROUP, not just the leader.
 *
 * Commands are spawned `detached: true` so each gets its own process group; on
 * timeout or cancellation we must signal the **negative pid** to reap the entire
 * tree (a shell plus the real command, or the right-hand side of a pipe).
 * Falls back to signalling just the leader if the group signal fails (already
 * exited, or a platform without POSIX process groups). Never throws.
 *
 * This is the single canonical implementation shared by every spawner
 * (`quality`, `proposals` acceptance) — process-tree teardown is exactly the
 * kind of subtle code that must live in one place.
 */
export const killProcessGroup = (
	pid: number | undefined,
	signal: NodeJS.Signals = 'SIGKILL',
): void => {
	if (pid === undefined) return;
	try {
		process.kill(-pid, signal);
	} catch {
		try {
			process.kill(pid, signal);
		} catch {
			// already gone
		}
	}
};

const killDirectProcess = (
	pid: number | undefined,
	signal: NodeJS.Signals = 'SIGKILL',
): void => {
	if (pid === undefined) return;
	try {
		process.kill(pid, signal);
	} catch {
		// already gone
	}
};

const killWindowsProcessTree = async (pid: number): Promise<void> =>
	new Promise((resolve) => {
		const taskkill = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
			stdio: 'ignore',
			windowsHide: true,
		});
		taskkill.on('error', () => {
			killDirectProcess(pid);
			resolve();
		});
		taskkill.on('close', (code) => {
			if (code !== 0) {
				killDirectProcess(pid);
			}
			resolve();
		});
	});

/**
 * `runArgv` is argv-first on every platform, so timeout teardown must stay
 * shell-free too. POSIX uses a dedicated process group and a negative pid;
 * Windows uses `taskkill /T /F` to reap the whole descendant tree.
 */
export const killProcessTree = async (
	pid: number | undefined,
	signal: NodeJS.Signals = 'SIGKILL',
): Promise<void> => {
	if (pid === undefined) return;
	if (process.platform === 'win32') {
		await killWindowsProcessTree(pid);
		return;
	}
	killProcessGroup(pid, signal);
};
