/**
 * call-writes.constant.ts — how a server says a tool's writes were not
 * committed, so a client that starts it can pass the sentence on.
 */

/** The start of the stderr line a server writes when that commit fails. */
export const CALL_WRITES_NOT_COMMITTED = '[delendai] delendai could not commit';

/**
 * How long a commit of a call's writes may take. A commit runs the
 * repository's hooks, which in a busy swarm took more than the 60 seconds
 * a git call gets: the commit was killed and the verdict left behind,
 * six times in one day. The hooks decide, not the runner's default.
 */
export const COMMIT_TIMEOUT_MS = 10 * 60_000;
