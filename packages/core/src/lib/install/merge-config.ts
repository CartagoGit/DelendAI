/**
 * Pure merge of one MCP server entry into an IDE config document.
 *
 * The whole point of `delendai init` is to be SAFE: it must add our server
 * without touching the user's existing servers or any other settings in the
 * file. This function does exactly that, purely (no I/O), so it is trivially
 * testable — it parses the existing JSONC, sets `root[kind][serverName] = entry`
 * (creating only the missing containers) as an edit of the text, preserving
 * every sibling key and comment. Idempotent: re-running with the same entry reports `unchanged`.
 */
import { applyJsoncEdits, parseJsonc } from '../config/jsonc-document';

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
	entry: Record<string, unknown>,
): IMergeResult => {
	const written = existing !== null && existing.trim().length > 0;
	const parsed = written ? parseJsonc(existing).value : {};
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
		throw new Error('it is not a JSON object');
	const root = parsed as Record<string, unknown>;

	const container = (
		typeof root[kind] === 'object' && root[kind] !== null ? root[kind] : {}
	) as Record<string, unknown>;

	const had = Object.hasOwn(container, serverName);
	const same =
		had && JSON.stringify(container[serverName]) === JSON.stringify(entry);

	const action: IMergeAction = same
		? 'unchanged'
		: existing === null
			? 'created'
			: had
				? 'updated'
				: 'added';

	if (action === 'unchanged' && written) return { json: existing, action };
	// Host configurations are JSONC (VS Code's `mcp.json`, Zed's settings,
	// Antigravity's): edited in place, every comment, sibling and the
	// user's formatting stay as they were.
	if (written) {
		const json = applyJsoncEdits(existing, [
			{ path: [kind, serverName], value: entry },
		]);
		return { json: json.endsWith('\n') ? json : `${json}\n`, action };
	}
	const nextContainer = { ...container, [serverName]: entry };
	const nextRoot = { ...root, [kind]: nextContainer };
	return { json: `${JSON.stringify(nextRoot, null, 2)}\n`, action };
};
