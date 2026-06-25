/**
 * git-runner.interface.ts — the single shared contract for "run a git
 * subcommand" across the monorepo (f00065 slice F).
 *
 * This shape used to be redefined byte-for-byte in three places
 * (`packages/core/src/lib/shared/git-write.ts`,
 * `plugins/git/src/lib/services/git.ts`, and
 * `plugins/proposals/src/lib/shared/git-runner.ts`) — each carrying a comment
 * that it "mirrors" the others. Since every plugin already depends on
 * `@mcp-vertex/core`, the *contract* belongs here as one source of truth; the
 * concrete runner *implementations* (read-only vs write-oriented vs
 * standalone) stay where they are and merely implement this type.
 *
 * Exposed from `@mcp-vertex/core/public` as `IGitRunner` / `IGitRunResult`.
 */

/**
 * Result of running a git subcommand. `ok` is true only when git ran and
 * exited 0; otherwise `reason` explains why (git missing, timeout, stderr)
 * so a caller can distinguish "no result" from "git unavailable".
 */
export interface IGitRunResult {
	readonly ok: boolean;
	readonly output: string;
	readonly reason?: string;
}

/** Runs a git subcommand asynchronously. Injectable for tests. */
export type IGitRunner = (args: readonly string[]) => Promise<IGitRunResult>;
