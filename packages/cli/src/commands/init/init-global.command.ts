import { homedir } from 'node:os';

import {
	detectIsWsl,
	formatInstallReport,
	parseInitArgs,
} from '@mcp-vertex/core/cli';
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommandContext,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import { data } from '../../lib/helpers/cli-command.helper';

const parseGlobalArgs = (args: readonly string[]) => ({
	...parseInitArgs(args),
	all:
		args.includes('--all') || !args.some((arg) => arg.startsWith('--ide=')),
	globalOnly: true,
});

/** Install the MCP server once in the user's supported global host configs. */
export const runGlobalInit = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const options = parseGlobalArgs(args);
	const { runInstall } = await import('@mcp-vertex/core/public');
	const report = await runInstall(
		{
			projectDir: ctx.cwd,
			home: homedir(),
			platform: process.platform,
			appData: process.env.APPDATA,
			isWsl: detectIsWsl(),
		},
		options,
	);
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return data(report, report.ok ? EXIT_CODE.OK : EXIT_CODE.VALIDATION);
	}
	return {
		code: report.ok ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
		text: formatInstallReport(report),
	};
};
