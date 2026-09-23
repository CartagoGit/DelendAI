import { existsSync } from 'node:fs';

import { McpStdioClient } from '@delendai/client/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommandContext,
	ICliGlobalOptions,
} from '../contracts/interfaces/cli-command.interface';
import { buildServerArgs } from './server-args.service';

/**
 * The file to spawn as the server.
 *
 * ## The server is the binary already running
 *
 * This used to be a ladder of four guesses — `<cwd>/packages/cli/src/index.ts`,
 * then two paths relative to this module, then `<cwd>/packages/cli/dist/index.js`
 * — and every rung described the DEVELOPMENT layout. Driven from the built
 * bundle in a consumer project, all four were missing, the spawn failed,
 * and every command that needs a server answered `Connection closed`. The
 * shipped CLI could not start its own server, which is every consumer.
 *
 * The answer was never a search. `__serve` is handled by this same
 * entrypoint (see `runEntry`), in both layouts: running from source,
 * `process.argv[1]` is `packages/cli/src/index.ts`; installed, it is the
 * published bundle. So the server is whatever file is executing, and one
 * statement replaces four guesses that could each be wrong somewhere.
 *
 * `DELENDAI_SERVER_BIN` stays as the deliberate override — a host that
 * embeds the CLI differently needs a way to say so, and an explicit answer
 * beats an inferred one.
 */
export const resolveServerEntrypoint = (
	env: NodeJS.ProcessEnv = process.env,
	argv: readonly string[] = process.argv,
): string => {
	const override = env.DELENDAI_SERVER_BIN;
	if (override !== undefined && override !== '') return override;
	const running = argv[1];
	if (running !== undefined && running !== '' && existsSync(running)) {
		return running;
	}
	// A host that hid argv[1] must say which file to spawn: guessing here
	// is what produced four wrong answers.
	throw Object.assign(
		new Error(
			'Cannot tell which file to run as the delendai server: this process does not expose its own entrypoint. Set DELENDAI_SERVER_BIN to the delendai binary.',
		),
		{ code: EXIT_CODE.USAGE },
	);
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
	const entrypoint = resolveServerEntrypoint();
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
