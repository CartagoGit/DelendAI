/**
 * host-config-rewrites.ts — the host config shapes beyond a server map:
 * servers listed in an array (Continue) and Codex's TOML tables. Each
 * rewrite touches the server entries only.
 */
import { rewriteIdentityInString } from './identity-renames';

/** Every key and string under `value`, rewritten: one server entry, whole. */
const rewriteDeep = (value: unknown): unknown => {
	if (typeof value === 'string') return rewriteIdentityInString(value);
	if (Array.isArray(value)) return value.map(rewriteDeep);
	if (value === null || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, child]) => [
			rewriteIdentityInString(key),
			rewriteDeep(child),
		]),
	);
};

/**
 * Hosts that list their servers as an array — Continue's
 * `experimental.modelContextProtocolServers`, an `mcpServers` array —
 * each entry with a `transport` that holds the command.
 */
export const rewriteServerArrays = (
	config: Record<string, unknown>,
): { readonly changed: boolean; readonly next: Record<string, unknown> } => {
	const next: Record<string, unknown> = { ...config };
	if (Array.isArray(next.mcpServers)) {
		next.mcpServers = next.mcpServers.map(rewriteDeep);
	}
	const experimental = next.experimental;
	if (
		experimental !== null &&
		typeof experimental === 'object' &&
		!Array.isArray(experimental) &&
		Array.isArray(
			(experimental as Record<string, unknown>)
				.modelContextProtocolServers,
		)
	) {
		const block = experimental as Record<string, unknown>;
		next.experimental = {
			...block,
			modelContextProtocolServers: (
				block.modelContextProtocolServers as unknown[]
			).map(rewriteDeep),
		};
	}
	return {
		changed: JSON.stringify(next) !== JSON.stringify(config),
		next,
	};
};

/**
 * Codex's TOML, rewritten inside its `[mcp_servers.…]` tables only: the
 * table header (the server's name) and every line until the next table.
 * Lines outside those tables are the person's other settings and are
 * not read.
 */
export const rewriteCodexConfig = (text: string): string => {
	let inServer = false;
	return text
		.split('\n')
		.map((line) => {
			const header = /^\s*\[/u.test(line);
			if (header) inServer = /^\s*\[\s*mcp_servers[.\]]/u.test(line);
			return inServer ? rewriteIdentityInString(line) : line;
		})
		.join('\n');
};
