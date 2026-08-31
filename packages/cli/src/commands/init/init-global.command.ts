import { homedir } from 'node:os';

import {
	detectIsWsl,
	formatInstallReport,
	parseInitArgs,
	targetById,
	type IInstallOptions,
} from '@mcp-vertex/core/public';
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommandContext,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import { data } from '../../lib/helpers/cli-command.helper';

export interface IGlobalInitArgs {
	readonly options?: IInstallOptions;
	readonly error?: string;
}

/** Parse global-init flags without allowing project autodetection to leak in. */
export const parseGlobalArgs = (args: readonly string[]): IGlobalInitArgs => {
	const ideFlag = args.find((arg) => arg.startsWith('--ide='));
	const parsed = parseInitArgs(args);
	if (ideFlag !== undefined) {
		if (parsed.ide === undefined || parsed.ide.length === 0) {
			return {
				error: 'usage: --ide must contain at least one target id',
			};
		}
		for (const id of parsed.ide) {
			const target = targetById(id);
			if (target === undefined) {
				return { error: `unknown global host target: ${id}` };
			}
			if (target.scope !== 'global') {
				return {
					error: `target is project-scoped, use init instead: ${id}`,
				};
			}
		}
	}
	return {
		options: {
			...parsed,
			all: args.includes('--all') || ideFlag === undefined,
			globalOnly: true,
		},
	};
};

/** Install the MCP server once in the user's supported global host configs. */
export const runGlobalInit = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const parsed = parseGlobalArgs(args);
	if (parsed.error !== undefined) {
		return { code: EXIT_CODE.USAGE, error: parsed.error };
	}
	const options = parsed.options!;
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
