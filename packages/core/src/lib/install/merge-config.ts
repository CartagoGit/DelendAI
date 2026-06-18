/**
 * Pure merge of one MCP server entry into an IDE config document (M39).
 *
 * The whole point of `mcp-vertex init` is to be SAFE: it must add our server
 * without touching the user's existing servers or any other settings in the
 * file. This function does exactly that, purely (no I/O), so it is trivially
 * testable — it parses the existing JSON, sets `root[kind][serverName] = entry`
 * (creating only the missing containers), and re-serializes, preserving every
 * sibling key. Idempotent: re-running with the same entry reports `unchanged`.
 */
export type IMcpConfigKind = 'mcpServers' | 'servers' | 'context_servers';

export type IMergeAction = 'created' | 'added' | 'updated' | 'unchanged';

export interface IMergeResult {
	readonly json: string;
	readonly action: IMergeAction;
}

/**
 * @param existing  current file contents, or `null` if the file does not exist.
 * @param kind      the top-level key the IDE expects (`mcpServers` | `servers` | …).
 * @param serverName the key under `kind` for our server.
 * @param entry     the server definition (`{ command, args, … }`).
 */
export const mergeServerEntry = (
	existing: string | null,
	kind: IMcpConfigKind,
	serverName: string,
	entry: Record<string, unknown>
): IMergeResult => {
	const root: Record<string, unknown> =
		existing && existing.trim().length > 0
			? (JSON.parse(existing) as Record<string, unknown>)
			: {};

	const container = (
		typeof root[kind] === 'object' && root[kind] !== null ? root[kind] : {}
	) as Record<string, unknown>;

	const had = Object.hasOwn(container, serverName);
	const same = had && JSON.stringify(container[serverName]) === JSON.stringify(entry);

	const action: IMergeAction = same
		? 'unchanged'
		: existing === null
			? 'created'
			: had
				? 'updated'
				: 'added';

	// Preserve every other server and every other top-level key.
	const nextContainer = { ...container, [serverName]: entry };
	const nextRoot = { ...root, [kind]: nextContainer };

	return { json: `${JSON.stringify(nextRoot, null, 2)}\n`, action };
};
