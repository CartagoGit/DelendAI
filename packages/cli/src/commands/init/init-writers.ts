/**
 * f00084 S2 — idempotent file writers.
 *
 * Every write goes through `writeConfigSafely` or `writeWorkspaceFileSafely`
 * (both already wrap `withFileMutex` + `writeFileAtomic` + `redactSecrets`).
 * `init` MUST never block other agents; the mutex is per-file, never global.
 */
import { existsSync } from 'node:fs';

import {
	writeConfigSafely,
	writeWorkspaceFileSafely,
} from '../../lib/config-file';

export type IInitWrite = {
	readonly path: string;
	readonly content: string;
};

/**
 * Writes the canonical `mcp-vertex.config.json` for the workspace. Refuses to
 * overwrite without `force=true` — when the file already exists and the user
 * has not opted in, returns `{ kind: 'exists', path }` and writes nothing.
 * The object is the parsed config; `writeConfigSafely` re-validates it
 * against `CONFIG_FILE_SCHEMA` and runs it through `redactSecrets`.
 */
export const writeMcpVertexConfig = async (
	workspace: string,
	value: Record<string, unknown>,
	force: boolean,
): Promise<
	{ kind: 'written'; path: string } | { kind: 'exists'; path: string }
> => {
	const path = `${workspace}/mcp-vertex.config.json`;
	const probe = existsSync(path);
	if (probe && !force) return { kind: 'exists', path };
	const written = await writeConfigSafely(workspace, value);
	return { kind: 'written', path: written };
};

/** Append-or-overwrite semantics for a generic file inside the workspace. */
export const writeWorkspaceText = async (
	workspace: string,
	relPath: string,
	content: string,
	mode: 'append' | 'overwrite' | 'skip',
): Promise<{ kind: 'written' | 'exists' | 'skipped'; path: string }> => {
	if (mode === 'skip')
		return { kind: 'skipped', path: `${workspace}/${relPath}` };
	const path = await writeWorkspaceFileSafely(workspace, relPath, content);
	return { kind: 'written', path };
};
