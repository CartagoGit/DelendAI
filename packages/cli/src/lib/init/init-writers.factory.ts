/**
 * f00084 S2 — idempotent file writers.
 *
 * Every write goes through `writeConfigSafely` or `writeWorkspaceFileSafely`
 * (both already wrap `withFileMutex` + `writeFileAtomic` + `redactSecrets`).
 * `init` MUST never block other agents; the mutex is per-file, never global.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import type {
	IInitWrite,
	IMcpJsonWriteResult,
} from '../../contracts/interfaces/init.interface';
import type { ICanonicalLaunch } from '../../contracts/interfaces/canonical-launch.interface';
import { mergeDerivedConfig } from '@delendai/core/public';
import {
	writeConfigSafely,
	writeWorkspaceFileSafely,
} from '../config-file.service';
import { buildCoreSkillProjection } from './core-skill-projection.service';
import {
	mergeDelendaiServerEntry,
	renderDelendaiServerEntry,
} from './init-render.service';

export type { IInitWrite, IMcpJsonWriteResult };

/**
 * Writes the canonical `delendai.config.json` for the workspace. A valid
 * existing project configuration is merged by default: its values and plugin
 * options win, while generated defaults only fill gaps. `force=true` is the
 * deliberate replacement path. Invalid existing JSON is left untouched unless
 * replacement was explicitly requested.
 */
export const writeDelendaiConfig = async (
	workspace: string,
	value: Record<string, unknown>,
	force: boolean,
): Promise<
	| { kind: 'written'; path: string }
	| { kind: 'merged'; path: string }
	| { kind: 'exists'; path: string }
> => {
	const path = `${workspace}/delendai.config.json`;
	const probe = existsSync(path);
	if (!probe || force) {
		const written = await writeConfigSafely(workspace, value);
		return { kind: 'written', path: written };
	}
	let existing: unknown;
	try {
		existing = JSON.parse(await readFile(path, 'utf8'));
	} catch {
		return { kind: 'exists', path };
	}
	if (
		existing === null ||
		typeof existing !== 'object' ||
		Array.isArray(existing)
	) {
		return { kind: 'exists', path };
	}
	const written = await writeConfigSafely(
		workspace,
		mergeDerivedConfig(value, existing as Record<string, unknown>),
	);
	return { kind: 'merged', path: written };
};

type ISkillProjectionWriteResult = {
	readonly kind: 'written' | 'exists' | 'merged';
	readonly path: string;
};

const mergeSkillManifest = (
	existing: string,
	incoming: string,
): string | undefined => {
	try {
		const current = JSON.parse(existing) as {
			skills?: Array<{ id?: unknown }>;
		};
		const next = JSON.parse(incoming) as { skills?: unknown[] };
		if (!Array.isArray(current.skills) || !Array.isArray(next.skills))
			return undefined;
		// De-dup `current.skills` by id before spreading: if the existing
		// manifest already has duplicate id entries (e.g. two `delendai-
		// operator` rows from a prior broken merge), the previous version
		// preserved them verbatim and the new merge never stripped them.
		const seenIds = new Set<string>();
		const dedupedCurrent = current.skills.filter((skill) => {
			const id = (skill as { id?: unknown }).id;
			if (typeof id !== 'string') return true; // keep non-id rows untouched
			if (seenIds.has(id)) return false;
			seenIds.add(id);
			return true;
		});
		return `${JSON.stringify(
			{
				...current,
				skills: [
					...dedupedCurrent,
					...next.skills.filter((skill) => {
						if (skill === null || typeof skill !== 'object')
							return false;
						const id = (skill as { id?: unknown }).id;
						return typeof id === 'string' && !seenIds.has(id);
					}),
				],
			},
			null,
			'\t',
		)}\n`;
	} catch {
		return undefined;
	}
};

/**
 * Materialize the portable core skills in the consumer's configured docs
 * directory. Existing bodies and manifest entries are the project's own and
 * are preserved unless the caller deliberately selected replacement.
 */
export const writeCoreSkillProjection = async (
	workspace: string,
	docsDir: string,
	force: boolean,
): Promise<readonly ISkillProjectionWriteResult[]> => {
	const projection = await buildCoreSkillProjection(docsDir);
	const writes: ISkillProjectionWriteResult[] = [];
	for (const file of projection) {
		const path = `${workspace}/${file.relPath}`;
		if (!existsSync(path) || force) {
			writes.push({
				kind: 'written',
				path: await writeWorkspaceFileSafely(
					workspace,
					file.relPath,
					file.content,
				),
			});
			continue;
		}
		if (!file.relPath.endsWith('/skills/manifest.json')) {
			writes.push({ kind: 'exists', path });
			continue;
		}
		const merged = mergeSkillManifest(
			await readFile(path, 'utf8'),
			file.content,
		);
		if (merged === undefined) {
			writes.push({ kind: 'exists', path });
			continue;
		}
		writes.push({
			kind: 'merged',
			path: await writeWorkspaceFileSafely(
				workspace,
				file.relPath,
				merged,
			),
		});
	}
	return writes;
};

/**
 * Outcome of writing `.vscode/mcp.json`. Three terminal states:
 *
 *   - `written`: the merge succeeded (existing servers preserved,
 *     `delendai` entry upserted). Use this for the recap's
 *     `[ok]` stamp.
 *   - `merged`: an existing `.vscode/mcp.json` was updated via
 *     merge — the file existed and we successfully upserted only
 *     the `delendai` entry while preserving every other server.
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
 * `mergeDelendaiServerEntry` (init-render.ts). This writer adds:
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
const writeMcpJson = async (
	workspace: string,
	relPath: '.vscode/mcp.json' | '.mcp.json',
	kind: 'servers' | 'mcpServers',
	launch: ICanonicalLaunch,
	mode: 'append' | 'overwrite' | 'skip',
	serverName = 'delendai',
): Promise<IMcpJsonWriteResult> => {
	const path = `${workspace}/${relPath}`;
	if (mode === 'skip') return { kind: 'skipped', path };

	const probe = existsSync(path);
	if (!probe) {
		// Fresh install — write the canonical bundle with only the
		// `delendai` server. The merge would have nothing to merge
		// against, so we skip it.
		const content = `${JSON.stringify(
			{ [kind]: { [serverName]: renderDelendaiServerEntry(launch) } },
			null,
			'\t',
		)}\n`;
		const written = await writeWorkspaceFileSafely(
			workspace,
			relPath,
			content,
		);
		return { kind: 'written', path: written };
	}

	// File exists — read, merge, write.
	const existing = await readFile(path, 'utf8');
	const merged = mergeDelendaiServerEntry(launch, existing, kind, serverName);
	if (merged === undefined) {
		// Refused to merge: existing content isn't a JSON object.
		// Leave it alone and surface `exists` so the operator knows
		// to hand-edit before the next `init` run.
		return { kind: 'exists', path };
	}

	const written = await writeWorkspaceFileSafely(workspace, relPath, merged);

	// Compute the list of servers we preserved (everything in the
	// merged file except `delendai`) so the recap can surface a
	// hint like "preserved 2 server(s): filesystem, github".
	let preserved: readonly string[] = [];
	try {
		const parsed = JSON.parse(merged) as Record<string, unknown>;
		const servers = parsed[kind];
		if (servers !== null && typeof servers === 'object') {
			preserved = Object.keys(servers as Record<string, unknown>).filter(
				(name) => name !== serverName,
			);
		}
	} catch {
		// Shouldn't happen — we just wrote this content — but be
		// defensive about the recap hint.
		preserved = [];
	}
	return { kind: 'merged', path: written, preserved };
};

export const writeVscodeMcpJson = (
	workspace: string,
	launch: ICanonicalLaunch,
	mode: 'append' | 'overwrite' | 'skip',
	serverName = 'delendai',
): Promise<IMcpJsonWriteResult> =>
	writeMcpJson(
		workspace,
		'.vscode/mcp.json',
		'servers',
		launch,
		mode,
		serverName,
	);

export const writeGenericMcpJson = (
	workspace: string,
	launch: ICanonicalLaunch,
	mode: 'append' | 'overwrite' | 'skip',
	serverName = 'delendai',
): Promise<IMcpJsonWriteResult> =>
	writeMcpJson(
		workspace,
		'.mcp.json',
		'mcpServers',
		launch,
		mode,
		serverName,
	);

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
