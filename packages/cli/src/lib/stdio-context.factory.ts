import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { McpStdioClient } from '@mcp-vertex/client/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommandContext,
	ICliGlobalOptions,
} from '../contracts/interfaces/cli-command.interface';
import { buildServerArgs } from './server-args.service';

const resolveServerEntrypoint = (cwd: string): string => {
	if (process.env.MCP_VERTEX_SERVER_BIN)
		return process.env.MCP_VERTEX_SERVER_BIN;
	const source = join(cwd, 'packages/cli/src/index.ts');
	if (existsSync(source)) return source;
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
