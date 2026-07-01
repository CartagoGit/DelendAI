/**
 * f00084 S2 — idempotent file writers.
 *
 * Every write goes through `writeConfigSafely` or `writeWorkspaceFileSafely`
 * (both already wrap `withFileMutex` + `writeFileAtomic` + `redactSecrets`).
 * `init` MUST never block other agents; the mutex is per-file, never global.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import {
	writeConfigSafely,
	writeWorkspaceFileSafely,
} from '../config-file.service';
import { mergeMcpVertexServerEntry } from './init-render.service';
import type {
	IInitWrite,
	IMcpJsonWriteResult,
} from '../../contracts/interfaces/init.interface';

export type { IInitWrite, IMcpJsonWriteResult };

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

/**
 * Outcome of writing `.vscode/mcp.json`. Three terminal states:
 *
 *   - `written`: the merge succeeded (existing servers preserved,
 *     `mcp-vertex` entry upserted). Use this for the recap's
 *     `[ok]` stamp.
 *   - `merged`: an existing `.vscode/mcp.json` was updated via
 *     merge — the file existed and we successfully upserted only
 *     the `mcp-vertex` entry while preserving every other server.
 *     Surfaced in the recap as `[merged]` to make the upsert
 *     visible to the operator (this is the path that used to
 *     silently destroy their other MCP servers).
 *   - `exists`: an existing `.vscode/mcp.json` was left untouched
 *     because its content is not parseable as a JSON object. The
 *     operator must hand-edit or delete it before `init` will
 *     touch it again. Surfaced in the recap as `[exists]`.
 *   - `skipped`: the operator passed `--host-instructions=skip`
 *     or otherwise opted out; nothing was written.
 *
 * `IMcpJsonWriteResult` is defined in
 * `contracts/interfaces/init.interface.ts`; this file re-exports it so
 * the call sites (`init.command.ts`, `init-default.command.ts`,
 * `init-render.service.ts`) keep importing it from here.
 */

/**
 * Write `.vscode/mcp.json` preserving every other server entry.
 *
 * The merge semantics are described in
 * `mergeMcpVertexServerEntry` (init-render.ts). This writer adds:
 *
 *   - Atomic write through `writeWorkspaceFileSafely` (mutex +
 *     atomic rename + redact).
 *   - Read of the existing file via `node:fs/promises.readFile`
 *     (never sync — see AGENTS.md hard rule #3).
 *   - Three-way outcome reporting (`written` / `merged` / `exists`)
 *     so the recap can tell the operator whether their other MCP
 *     servers were preserved or the file was left untouched
 *     because it was unparseable.
 */
export const writeVscodeMcpJson = async (
	workspace: string,
	hostEntryPath: string,
	mode: 'append' | 'overwrite' | 'skip',
): Promise<IMcpJsonWriteResult> => {
	const path = `${workspace}/.vscode/mcp.json`;
	if (mode === 'skip') return { kind: 'skipped', path };

	const probe = existsSync(path);
	if (!probe) {
		// Fresh install — write the canonical bundle with only the
		// `mcp-vertex` server. The merge would have nothing to merge
		// against, so we skip it.
		const content = `${JSON.stringify(
			{
				servers: {
					'mcp-vertex': {
						type: 'stdio',
						command: 'bun',
						args: [
							hostEntryPath,
							'--workspace=${workspaceFolder}',
							'--config=${workspaceFolder}/mcp-vertex.config.json',
						],
					},
				},
			},
			null,
			'\t',
		)}\n`;
		const written = await writeWorkspaceFileSafely(
			workspace,
			'.vscode/mcp.json',
			content,
		);
		return { kind: 'written', path: written };
	}

	// File exists — read, merge, write.
	const existing = await readFile(path, 'utf8');
	const merged = mergeMcpVertexServerEntry(hostEntryPath, existing);
	if (merged === undefined) {
		// Refused to merge: existing content isn't a JSON object.
		// Leave it alone and surface `exists` so the operator knows
		// to hand-edit before the next `init` run.
		return { kind: 'exists', path };
	}

	const written = await writeWorkspaceFileSafely(
		workspace,
		'.vscode/mcp.json',
		merged,
	);

	// Compute the list of servers we preserved (everything in the
	// merged file except `mcp-vertex`) so the recap can surface a
	// hint like "preserved 2 server(s): filesystem, github".
	let preserved: readonly string[] = [];
	try {
		const parsed = JSON.parse(merged) as { servers?: Record<string, unknown> };
		if (parsed.servers !== undefined) {
			preserved = Object.keys(parsed.servers).filter(
				(name) => name !== 'mcp-vertex',
			);
		}
	} catch {
		// Shouldn't happen — we just wrote this content — but be
		// defensive about the recap hint.
		preserved = [];
	}
	return { kind: 'merged', path: written, preserved };
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
