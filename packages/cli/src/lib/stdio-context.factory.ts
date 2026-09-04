import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpStdioClient } from '@delendai/client/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommandContext,
	ICliGlobalOptions,
} from '../contracts/interfaces/cli-command.interface';
import { buildServerArgs } from './server-args.service';

/**
 * Resolve the path to `packages/cli/src/index.ts` (the in-process server
 * entrypoint that the CLI spawns back over stdio).
 *
 * Why this is non-trivial: `cwd` is the **consumer workspace** (e.g.
 * logistics-app), NOT the mcp-vertex repo. Naively `join(cwd, 'packages/cli/src/index.ts')`
 * resolves to a non-existent path and the spawned server dies with
 * `MCP error -32000: Connection closed` against the stdio client.
 *
 * Resolution order:
 *   1. `MCP_VERTEX_SERVER_BIN` env override (escape hatch).
 *   2. Relative to `cwd` (works when the CLI happens to be run from
 *      inside the mcp-vertex repo itself).
 *   3. Relative to the location of THIS file (`import.meta.url`). This
 *      file lives at `<mcp-vertex>/packages/cli/src/lib/`, so the
 *      server entrypoint `<mcp-vertex>/packages/cli/src/index.ts` is
 *      one level up: `../index.ts`.
 *   4. Last-resort dist path: `../../dist/index.js`.
 */
const resolveServerEntrypoint = (cwd: string): string => {
	if (process.env.MCP_VERTEX_SERVER_BIN)
		return process.env.MCP_VERTEX_SERVER_BIN;
	const localSource = join(cwd, 'packages/cli/src/index.ts');
	if (existsSync(localSource)) return localSource;
	const here = dirname(fileURLToPath(import.meta.url));
	// this file lives at <mcp-vertex>/packages/cli/src/lib/stdio-context.factory.ts,
	// so the server entrypoint <mcp-vertex>/packages/cli/src/index.ts is one
	// level up: `../index.ts`.
	const sourceFromHere = join(here, '..', 'index.ts');
	if (existsSync(sourceFromHere)) return sourceFromHere;
	// Last-resort dist path: <mcp-vertex>/packages/cli/dist/index.js requires
	// two levels up: `../../dist/index.js`.
	const distFromHere = join(here, '..', '..', 'dist', 'index.js');
	if (existsSync(distFromHere)) return distFromHere;
	// Fall back to the original behaviour so the error message still surfaces
	// the candidate path the caller would have expected.
	return join(cwd, 'packages/cli/dist/index.js');
};

export const createStdioContext = async (
	cwd: string,
	globals: ICliGlobalOptions,
	extraPlugins: readonly string[] = [],
): Promise<ICliCommandContext> => {
	if (
		globals.remote !== undefined &&
		globals.remote !== 'stdio' &&
		globals.remote.startsWith('tcp://')
	) {
		throw Object.assign(
			new Error('tcp remote transport is planned for v2'),
			{
				code: EXIT_CODE.REMOTE,
			},
		);
	}
	if (globals.remote !== undefined && globals.remote !== 'stdio') {
		throw Object.assign(
			new Error('unsupported remote transport; use --remote=stdio'),
			{ code: EXIT_CODE.USAGE },
		);
	}
	const entrypoint = resolveServerEntrypoint(cwd);
	const client = await McpStdioClient.connect({
		command: 'bun',
		args: [entrypoint, ...buildServerArgs(globals, extraPlugins)],
		cwd,
		stderr: 'pipe',
	});
	return {
		cwd,
		globals,
		request: <TOut>(toolName: string, args: object) =>
			client.request<object, TOut>(toolName, args),
		listTools: () => client.listTools(),
		close: () => client.close(),
	};
};
