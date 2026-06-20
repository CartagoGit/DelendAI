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
