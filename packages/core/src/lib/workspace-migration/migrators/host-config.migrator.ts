/**
 * host-config.migrator.ts — b00239 S4.
 *
 * Rewrites host-side MCP configuration files in place.
 *
 * ## Scope, narrow on purpose
 *
 * Owns ONE file the S4 surface explicitly enumerates:
 * `<workspaceRoot>/.vscode/mcp.json`. That is the canonical MCP
 * server registration file for the VS Code host and the one file
 * the project itself writes on every `init`. Other client configs
 * (Cursor, Antigravity, Claude Code, Codex) are workspace-local
 * read-only stubs for S4 — S5 owns the global / home-dir migration
 * that proves a config entry belongs to the workspace being
 * migrated.
 *
 * ## Why JSON.parse, not JSONC
 *
 * `.vscode/mcp.json` is the VS Code spec: JSON only, no comments,
 * no trailing commas. A JSONC parser would let a malformed file
 * slide through and silently produce a "fixed" version the host
 * cannot read.
 *
 * ## What gets rewritten
 *
 * The `servers` map (or `mcpServers`, the Cursor / Claude spelling)
 * is walked; any server whose `command`, `args`, `cwd` or `env`
 * contains the legacy identity is rewritten. Scoped keys (`type`,
 * `description`) are not touched.
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';

import {
	rewriteIdentityInString,
	stringHasLegacyIdentity,
} from './identity-renames';

/** The single file this migrator owns. Stable for the lifetime of v1. */
export const HOST_CONFIG_NAME = '.vscode/mcp.json';

/** Stable id recorded in the journal. NOT a number, by design. */
export const HOST_CONFIG_MIGRATOR_ID = 'hostConfigMigrator:v1';

/** Maps that hold server entries under either of the two spellings. */
const SERVER_MAPS = ['servers', 'mcpServers'] as const;

/** Within one server entry, these are the string-typed fields. */
const SERVER_STRING_FIELDS = ['command', 'cwd', 'type', 'description'] as const;

export class HostConfigParseError extends Error {
	readonly file: string;
	constructor(file: string, reason: string) {
		super(`host config ${file} is not valid JSON: ${reason}`);
		this.name = 'HostConfigParseError';
		this.file = file;
	}
}

const pathExists = async (absolutePath: string): Promise<boolean> =>
	access(absolutePath).then(
		() => true,
		() => false,
	);

const readHostConfig = async (
	absolutePath: string,
): Promise<Record<string, unknown>> => {
	const text = await readFile(absolutePath, 'utf8');
	try {
		const parsed = JSON.parse(text);
		if (
			parsed === null ||
			typeof parsed !== 'object' ||
			Array.isArray(parsed)
		) {
			throw new HostConfigParseError(
				absolutePath,
				'top-level value is not an object',
			);
		}
		return parsed as Record<string, unknown>;
	} catch (error) {
		if (error instanceof HostConfigParseError) throw error;
		throw new HostConfigParseError(
			absolutePath,
			error instanceof Error ? error.message : String(error),
		);
	}
};

/**
 * Rewrite one server entry's string-typed fields and any string in
 * its `args` / `env` arrays. The map key (the server name itself) is
 * also rewritten — the legacy server id → new server id is the
 * canonical rename of the project's MCP server.
 */
/**
 * Rewrite a nested record (e.g. the `env` object inside a server
 * entry) the same way the top-level `servers` map is rewritten:
 * keys and string values both walk `rewriteIdentityInString`. The
 * rebrand routinely produces env keys like `MCP_VERTEX_HOME` →
 * `DELENDAI_HOME`; a migrator that only touched values would leave
 * the keys half-converted, which is the failure the engine's
 * residual scanner (S8) is meant to catch.
 */
const rewriteNestedRecord = (
	record: Record<string, unknown>,
): { readonly changed: boolean; readonly next: Record<string, unknown> } => {
	let changed = false;
	const next: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(record)) {
		const rewrittenKey = rewriteIdentityInString(key);
		if (rewrittenKey !== key) changed = true;
		if (typeof child === 'string') {
			const rewrittenValue = rewriteIdentityInString(child);
			if (rewrittenValue !== child) changed = true;
			next[rewrittenKey] = rewrittenValue;
			continue;
		}
		next[rewrittenKey] = child;
	}
	return { changed, next };
};

const rewriteServerEntry = (
	key: string,
	value: unknown,
): { changed: boolean; nextKey: string; nextValue: unknown } => {
	let changed = false;
	const nextKey = rewriteIdentityInString(key);
	if (nextKey !== key) changed = true;

	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		if (typeof value === 'string') {
			const rewritten = rewriteIdentityInString(value);
			if (rewritten !== value) changed = true;
			return { changed, nextKey, nextValue: rewritten };
		}
		return { changed, nextKey, nextValue: value };
	}

	const entry = value as Record<string, unknown>;
	const next: Record<string, unknown> = {};
	for (const [field, child] of Object.entries(entry)) {
		if (typeof child === 'string') {
			const rewrittenField = rewriteIdentityInString(field);
			const rewrittenChild = rewriteIdentityInString(child);
			if (rewrittenField !== field) changed = true;
			if (rewrittenChild !== child) changed = true;
			next[rewrittenField] = rewrittenChild;
			continue;
		}
		if (Array.isArray(child) && (field === 'args' || field === 'env')) {
			let childChanged = false;
			const nextArray = child.map((element) => {
				if (typeof element !== 'string') return element;
				const rewritten = rewriteIdentityInString(element);
				if (rewritten !== element) childChanged = true;
				return rewritten;
			});
			if (childChanged) changed = true;
			next[field] = nextArray;
			continue;
		}
		// Nested object fields (`env`, `metadata`, future
		// additions) get the same key-rewriting walk as the top-level
		// `servers` map: every key carries the identity through
		// `MCP_VERTEX_HOME` → `DELENDAI_HOME` style rewrites, every
		// string value walks `rewriteIdentityInString`. The engine
		// stays narrow because only env-style records appear in the
		// MCP config we own; a non-record value here is left alone.
		if (
			child !== null &&
			typeof child === 'object' &&
			!Array.isArray(child)
		) {
			const nestedResult = rewriteNestedRecord(
				child as Record<string, unknown>,
			);
			if (nestedResult.changed) changed = true;
			next[field] = nestedResult.next;
			continue;
		}
		next[field] = child;
	}

	// Surface SERVER_STRING_FIELDS that are absent — the engine wants
	// a consistent shape; we only rewrite what is there.
	for (const field of SERVER_STRING_FIELDS) {
		if (field in next) continue;
		if (field in entry) next[field] = entry[field];
	}

	return { changed, nextKey, nextValue: next };
};

const rewriteHostConfig = (
	config: Record<string, unknown>,
): { readonly changed: boolean; readonly next: Record<string, unknown> } => {
	let changed = false;
	const next: Record<string, unknown> = { ...config };
	for (const mapName of SERVER_MAPS) {
		const map = next[mapName];
		if (map === null || typeof map !== 'object' || Array.isArray(map))
			continue;
		const rewritten: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(
			map as Record<string, unknown>,
		)) {
			const result = rewriteServerEntry(key, value);
			if (result.changed) changed = true;
			rewritten[result.nextKey] = result.nextValue;
		}
		next[mapName] = rewritten;
	}
	return { changed, next };
};

/**
 * Factory: a fresh migrator instance. Pure at import time, side-effect
 * free until `apply` is called.
 */
export const createHostConfigMigrator = (): IMigration => {
	const absoluteHostConfigPath = (ctx: IMigrationContext): string =>
		join(ctx.workspaceRoot, HOST_CONFIG_NAME);

	return {
		id: HOST_CONFIG_MIGRATOR_ID,

		detect: async (ctx) => pathExists(absoluteHostConfigPath(ctx)),

		plan: async (ctx): Promise<readonly IMigrationPlanStep[]> => {
			const absolute = absoluteHostConfigPath(ctx);
			if (!(await pathExists(absolute))) return [];
			const config = await readHostConfig(absolute);
			const { changed } = rewriteHostConfig(config);
			if (!changed) return [];
			return [
				{
					kind: 'rewrite-host-config',
					detail: `${HOST_CONFIG_NAME}: legacy server / namespace / path rewritten`,
				},
			];
		},

		apply: async (ctx) => {
			const absolute = absoluteHostConfigPath(ctx);
			if (!(await pathExists(absolute))) return;
			const config = await readHostConfig(absolute);
			const { changed, next } = rewriteHostConfig(config);
			if (!changed) return;
			await writeFile(
				absolute,
				`${JSON.stringify(next, null, '\t')}\n`,
				'utf8',
			);
		},
	};
};

export { stringHasLegacyIdentity };
