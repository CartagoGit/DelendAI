/**
 * x00072 SEC-001 S2 — Trust fingerprint for the stdio child launch.
 *
 * `globalState` remembers a SHA-256 fingerprint of the launch
 * (`command | args[] | cwd`) the user has already approved. Any change
 * to the launch OR to the workspace's `.mcp.json` invalidates the
 * stored fingerprint and forces a re-approval.
 *
 * Pure helpers only — no VS Code imports. Tests cover all four cases
 * (trusted + new fingerprint, trusted + matching fingerprint,
 *  fingerprint-mismatch, .mcp.json drift).
 */

import { createHash } from 'node:crypto';

export const TRUST_FINGERPRINT_KEY = 'mcp-vertex.trust.fingerprint';
export const MCP_JSON_HASH_KEY = 'mcp-vertex.trust.mcpJsonHash';

export interface IServerLaunch {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string;
}

/** Hex SHA-256 of the canonical (command|args|cwd) projection. */
export const computeLaunchFingerprint = (launch: IServerLaunch): string => {
	const canonical = JSON.stringify({
		command: launch.command,
		args: [...launch.args],
		cwd: launch.cwd ?? '',
	});
	return createHash('sha256').update(canonical).digest('hex');
};

/** Hex SHA-256 of the raw `.mcp.json` body. `undefined` when absent. */
export const computeMcpJsonHash = (
	raw: string | undefined,
): string | undefined =>
	raw === undefined || raw.length === 0
		? undefined
		: createHash('sha256').update(raw).digest('hex');

export interface ITrustState {
	readonly fingerprint: string | undefined;
	readonly mcpJsonHash: string | undefined;
}

export interface IFingerprintStore {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

const readState = (store: IFingerprintStore): ITrustState => ({
	fingerprint: store.get<string>(TRUST_FINGERPRINT_KEY),
	mcpJsonHash: store.get<string>(MCP_JSON_HASH_KEY),
});

/**
 * Returns true when the stored fingerprint matches AND the stored
 * `.mcp.json` hash matches the current one (when one was stored).
 * Either mismatch invalidates the cached approval.
 */
export const isLaunchApproved = (
	store: IFingerprintStore,
	launch: IServerLaunch,
	currentMcpJsonRaw: string | undefined,
): boolean => {
	const state = readState(store);
	const fp = computeLaunchFingerprint(launch);
	if (state.fingerprint !== fp) return false;
	const currentHash = computeMcpJsonHash(currentMcpJsonRaw);
	if (state.mcpJsonHash === undefined) return currentHash === undefined;
	// When no `.mcp.json` is involved, the stored hash must be undefined.
	// Otherwise the fingerprint has to match the current body too.
	return state.mcpJsonHash === currentHash;
};

/** Persist approval for a launch + current `.mcp.json` body. */
export const recordApproval = async (
	store: IFingerprintStore,
	launch: IServerLaunch,
	currentMcpJsonRaw: string | undefined,
): Promise<void> => {
	const fp = computeLaunchFingerprint(launch);
	await store.update(TRUST_FINGERPRINT_KEY, fp);
	await store.update(
		MCP_JSON_HASH_KEY,
		computeMcpJsonHash(currentMcpJsonRaw),
	);
};

/** Erase any cached approval (used by invalidation paths). */
export const clearApproval = async (
	store: IFingerprintStore,
): Promise<void> => {
	await store.update(TRUST_FINGERPRINT_KEY, undefined);
	await store.update(MCP_JSON_HASH_KEY, undefined);
};

/** Human-readable one-liner used in the QuickPick. */
export const describeLaunch = (launch: IServerLaunch): string => {
	const args = launch.args.length === 0 ? '' : ` ${launch.args.join(' ')}`;
	const cwd = launch.cwd === undefined ? '' : ` (cwd=${launch.cwd})`;
	return `${launch.command}${args}${cwd}`;
};
