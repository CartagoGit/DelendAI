/**
 * shell-fallback-intent-map.ts — f00085 S3.
 *
 * Ring 3 of the shell-fallback ladder: map a `command + args` intent
 * to the non-shell tool that does the same job. When no terminal is
 * available the agent keeps writing plan code in its natural shell
 * shape (`cat foo`, `git status`) and this adapter tells it which
 * file/MCP tool to call instead.
 *
 * Pure, dependency-free, table-driven (Open/Closed: a new command is
 * one more entry in {@link SHELL_INTENT_MAP}). Anything not in the
 * table maps to a `null` plan with a clear hint so the agent can fix
 * its plan rather than silently no-op.
 *
 * This module is re-exported through `shell-fallback.ts` and the
 * public barrel; import it from `@mcp-vertex/core/public`.
 */

/** A parsed shell intent: the command and its positional arguments. */
export interface IShellIntent {
	/** The leading binary, e.g. `git`, `cat`, `grep`. */
	readonly command: string;
	/** Positional args after the command, e.g. `['status']`. */
	readonly args: readonly string[];
}

/** The non-shell substitute the adapter recommends for an intent. */
export interface IShellToolPlan {
	/** The tool an agent should call instead of the shell command. */
	readonly tool: string;
	/**
	 * How to populate the tool's inputs from the intent's args, in
	 * prose. Kept human-readable on purpose: the consumer is an agent
	 * reading the plan, not a code path constructing the call.
	 */
	readonly note: string;
}

/**
 * One handler per supported shell command. Each receives the parsed
 * args and returns the recommended tool plan, or `null` when the
 * specific sub-command is not covered (the caller turns `null` into a
 * "use the explicit file tool" hint).
 */
type IntentHandler = (args: readonly string[]) => IShellToolPlan | null;

/**
 * The intent table. Covers the top-10 shell commands agents actually
 * reach for (f00085 S3): `cat`, `head`, `tail`, `grep`, `find`, `ls`,
 * `git status`, `git diff`, `git log`, `mkdir`.
 */
export const SHELL_INTENT_MAP: Readonly<Record<string, IntentHandler>> = {
	cat: (args) => ({
		tool: 'read_file',
		note:
			args.length > 0
				? `read_file { path: ${JSON.stringify(args[0])} }`
				: 'read_file { path } — pass the target path',
	}),
	head: () => ({
		tool: 'read_file',
		note: 'read_file with a small line range (e.g. the first N lines) instead of `head -n N`',
	}),
	tail: () => ({
		tool: 'read_file',
		note: 'read_file with an offset near end-of-file instead of `tail`; for live logs use session_store_sql',
	}),
	grep: (args) => ({
		tool: 'grep_search',
		note:
			args.length > 0
				? `grep_search { query: ${JSON.stringify(args[args.length - 1])} } (use semantic_search for fuzzy intent)`
				: 'grep_search { query } — pass the pattern',
	}),
	find: () => ({
		tool: 'file_search',
		note: 'file_search { query: <glob> } instead of `find`',
	}),
	ls: () => ({
		tool: 'file_search',
		note: 'file_search { query: "<dir>/*" } instead of `ls`',
	}),
	mkdir: () => ({
		tool: 'create_file',
		note: 'directories are created implicitly when create_file writes a file under them; no standalone mkdir needed',
	}),
	git: (args) => {
		const sub = args[0];
		switch (sub) {
			case 'status':
				return {
					tool: 'mcp-vertex_git_status',
					note: 'read-only working-tree status via the git MCP tool',
				};
			case 'diff':
				return {
					tool: 'mcp-vertex_git_diff',
					note: 'read-only diff via the git MCP tool',
				};
			case 'log':
				return {
					tool: 'mcp-vertex_git_log',
					note: 'read-only history via the git MCP tool',
				};
			default:
				return null;
		}
	},
};

/**
 * Map a shell intent to its non-shell tool plan. Returns `null` when
 * the command (or its specific sub-command) is not in the table; the
 * caller should surface a "use the explicit file tool for `<command>`"
 * hint so the agent fixes its plan.
 *
 * Defensive over its input: a missing/empty command yields `null`.
 */
export const mapShellIntentToTool = (
	intent: IShellIntent | null | undefined,
): IShellToolPlan | null => {
	if (
		!intent ||
		typeof intent.command !== 'string' ||
		intent.command === ''
	) {
		return null;
	}
	const handler = SHELL_INTENT_MAP[intent.command];
	if (!handler) return null;
	const args = Array.isArray(intent.args) ? intent.args : [];
	return handler(args);
};
