/**
 * f00046 S2 — memory commands. One subcommand per `memory_*` MCP tool
 * exposed by the `memory` plugin. Pure 1:1 delegation: the CLI maps
 * flags to the tool's public `inputSchema` and never touches disk
 * itself (the plugin owns `withFileMutex` + `writeFileAtomic`).
 *
 * Tools mapped:
 *   - `mcp-vertex_memory_save`   ({ title, body, tags?, ttlSeconds? })
 *   - `mcp-vertex_memory_recall` ({ query?, tags?, limit? })
 *   - `mcp-vertex_memory_list`   ({ limit?, offset? })
 *   - `mcp-vertex_memory_forget` ({ id })
 *   - `mcp-vertex_memory_export` ({ format?, includeExpired? })
 *   - `mcp-vertex_memory_import` ({ payload, format?, mode?, conflict? })
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import {
	data,
	hasFlag,
	listArg,
	numberArg,
	positionalArg,
	request,
	scalarArg,
	usage,
} from './group-helpers';

const memorySaveCommand: ICliCommand = {
	name: 'memory save',
	summary: 'Save a durable note (upserts by title).',
	async run(args, ctx) {
		const title = positionalArg(args);
		const body = scalarArg(args, 'body');
		if (title === undefined || body === undefined) {
			return usage(
				'memory save <title> --body=<text> [--tags=a,b] [--ttl=N]',
			);
		}
		const tags = listArg(args, 'tags');
		const ttl = numberArg(args, 'ttl') ?? numberArg(args, 'ttlSeconds');
		return data(
			await request(ctx, 'mcp-vertex_memory_save', {
				title,
				body,
				...(tags !== undefined ? { tags } : {}),
				...(ttl !== undefined ? { ttlSeconds: ttl } : {}),
			}),
		);
	},
};

const memoryRecallCommand: ICliCommand = {
	name: 'memory recall',
	summary: 'Recall durable notes by query and/or tags.',
	async run(args, ctx) {
		const query = positionalArg(args);
		const tags = listArg(args, 'tags');
		const limit = numberArg(args, 'limit') ?? numberArg(args, 'max');
		return data(
			await request(ctx, 'mcp-vertex_memory_recall', {
				...(query !== undefined ? { query } : {}),
				...(tags !== undefined ? { tags } : {}),
				...(limit !== undefined ? { limit } : {}),
			}),
		);
	},
};

const memoryListCommand: ICliCommand = {
	name: 'memory list',
	summary: 'List durable notes as a cheap index (id, title, tags).',
	async run(args, ctx) {
		const limit = numberArg(args, 'limit') ?? numberArg(args, 'max');
		const offset = numberArg(args, 'offset');
		return data(
			await request(ctx, 'mcp-vertex_memory_list', {
				...(limit !== undefined ? { limit } : {}),
				...(offset !== undefined ? { offset } : {}),
			}),
		);
	},
};

const memoryForgetCommand: ICliCommand = {
	name: 'memory forget',
	summary: 'Delete a durable note by id.',
	async run(args, ctx) {
		const id = positionalArg(args);
		if (id === undefined) return usage('memory forget <id>');
		return data(await request(ctx, 'mcp-vertex_memory_forget', { id }));
	},
};

const memoryExportCommand: ICliCommand = {
	name: 'memory export',
	summary: 'Export the note store as a portable snapshot.',
	async run(args, ctx) {
		const format = scalarArg(args, 'format');
		const includeExpired = hasFlag(args, 'include-expired');
		return data(
			await request(ctx, 'mcp-vertex_memory_export', {
				...(format !== undefined ? { format } : {}),
				...(includeExpired ? { includeExpired: true } : {}),
			}),
		);
	},
};

const memoryImportCommand: ICliCommand = {
	name: 'memory import',
	summary: 'Import a snapshot produced by memory export.',
	async run(args, ctx) {
		const payload = positionalArg(args);
		if (payload === undefined) {
			return usage(
				'memory import <payload> [--mode=merge|replace] [--conflict=overwrite|skip|merge] [--format=json|ndjson]',
			);
		}
		const format = scalarArg(args, 'format');
		const mode = scalarArg(args, 'mode');
		const conflict = scalarArg(args, 'conflict');
		return data(
			await request(ctx, 'mcp-vertex_memory_import', {
				payload,
				...(format !== undefined ? { format } : {}),
				...(mode !== undefined ? { mode } : {}),
				...(conflict !== undefined ? { conflict } : {}),
			}),
		);
	},
};

export const memoryCommands: readonly ICliCommand[] = [
	memorySaveCommand,
	memoryRecallCommand,
	memoryListCommand,
	memoryForgetCommand,
	memoryExportCommand,
	memoryImportCommand,
];
