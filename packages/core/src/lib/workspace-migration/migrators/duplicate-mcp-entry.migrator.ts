/**
 * duplicate-mcp-entry.migrator.ts — one editor starts one delendai server.
 *
 * VS Code reads `.vscode/mcp.json` and also loads the `.mcp.json` Claude
 * Code reads, so a project that init wrote both for started the server
 * twice from one window (three with Claude Code's own), each polling and
 * maintaining the same workspace. `.mcp.json` is the entry both hosts
 * read; this removes the server from `.vscode/mcp.json` when
 * `.mcp.json` already names it, keeps every other server in the file and
 * every comment, and deletes the file only when nothing else is left.
 */
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { applyJsoncEdits, parseJsonc } from '../../config/jsonc-document';
import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import { isRecord } from '../../shared/is-record';
import {
	DUPLICATE_MCP_ENTRY_MIGRATOR_ID,
	PROJECT_MCP_FILE,
	VSCODE_MCP_FILE,
} from './duplicate-mcp-entry.constant';

const exists = (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

const serversOf = (
	text: string,
	key: 'servers' | 'mcpServers',
): Record<string, unknown> | undefined => {
	const value = parseJsonc(text).value;
	if (!isRecord(value)) return undefined;
	const servers = value[key];
	return isRecord(servers) ? servers : undefined;
};

/** The servers `.vscode/mcp.json` repeats from `.mcp.json`, by name. */
const duplicated = async (
	ctx: IMigrationContext,
): Promise<readonly string[]> => {
	const vscode = join(ctx.workspaceRoot, VSCODE_MCP_FILE);
	const project = join(ctx.workspaceRoot, PROJECT_MCP_FILE);
	if (!(await exists(vscode)) || !(await exists(project))) return [];
	const here = serversOf(await readFile(vscode, 'utf8'), 'servers');
	const there = serversOf(await readFile(project, 'utf8'), 'mcpServers');
	if (here === undefined || there === undefined) return [];
	return Object.keys(here).filter(
		(name) => /delendai/iu.test(name) && name in there,
	);
};

export const createDuplicateMcpEntryMigrator = (): IMigration => ({
	id: DUPLICATE_MCP_ENTRY_MIGRATOR_ID,
	detect: async (ctx) => (await duplicated(ctx)).length > 0,
	plan: async (ctx): Promise<readonly IMigrationPlanStep[]> =>
		(await duplicated(ctx)).map((name) => ({
			kind: 'remove-duplicate-mcp-entry',
			detail: `${VSCODE_MCP_FILE}: "${name}" is already started from ${PROJECT_MCP_FILE}, which VS Code loads too`,
		})),
	apply: async (ctx) => {
		const names = await duplicated(ctx);
		if (names.length === 0) return;
		const vscode = join(ctx.workspaceRoot, VSCODE_MCP_FILE);
		const text = await readFile(vscode, 'utf8');
		const edited = applyJsoncEdits(
			text,
			names.map((name) => ({
				path: ['servers', name],
				value: undefined,
			})),
		);
		const parsed = parseJsonc(edited).value;
		const left = isRecord(parsed) ? parsed : {};
		const onlyEmptyServers =
			Object.keys(left).length === 1 &&
			Object.keys(serversOf(edited, 'servers') ?? { x: 1 }).length === 0;
		if (onlyEmptyServers) await rm(vscode);
		else await writeFile(vscode, edited, 'utf8');
	},
});
