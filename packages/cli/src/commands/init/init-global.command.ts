import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

import {
	targetById,
	type IInstallOptions,
	type IInstallReport,
	type IRunnerVia,
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

const VIAS = new Set<IRunnerVia>(['npx', 'bunx', 'pnpm', 'yarn', 'deno']);

const parseInstallArgs = (args: readonly string[]): IInstallOptions => {
	const options: {
		-readonly [K in keyof IInstallOptions]: IInstallOptions[K];
	} = {};
	for (const arg of args) {
		if (arg === '--all') options.all = true;
		else if (arg.startsWith('--ide=')) {
			options.ide = arg
				.slice(6)
				.split(',')
				.map((value) => value.trim())
				.filter((value) => value.length > 0);
		} else if (arg.startsWith('--via=')) {
			const via = arg.slice(6).trim();
			if (VIAS.has(via as IRunnerVia)) options.via = via as IRunnerVia;
		} else if (arg.startsWith('--preset=')) {
			options.preset = arg.slice(9).trim();
		}
	}
	return options;
};

const detectIsWsl = (): boolean => {
	if (process.platform !== 'linux') return false;
	if (
		process.env.WSL_DISTRO_NAME !== undefined ||
		process.env.WSL_INTEROP !== undefined
	) {
		return true;
	}
	try {
		return /microsoft|wsl/i.test(readFileSync('/proc/version', 'utf8'));
	} catch {
		return false;
	}
};

const formatInstallReport = (report: IInstallReport): string => {
	const lines: string[] = [`OS: ${report.os.label}`];
	if (report.os.note) lines.push(`  ${report.os.note}`);
	if (report.results.length === 0) {
		lines.push('No global host targets were configured.');
	} else {
		lines.push('Configured globally:');
		for (const result of report.results) {
			const mark = result.action === 'skipped' ? '-' : '*';
			const detail = result.reason ? ` (${result.reason})` : '';
			lines.push(
				`  ${mark} ${result.label} [${result.action}]${detail}  ${result.path}`,
			);
		}
		lines.push('');
		lines.push(
			'mcp-vertex was merged into global host configs without touching project files.',
		);
	}
	return `${lines.join('\n')}\n`;
};

/** Parse global-init flags without allowing project autodetection to leak in. */
export const parseGlobalArgs = (args: readonly string[]): IGlobalInitArgs => {
	const ideFlag = args.find((arg) => arg.startsWith('--ide='));
	const parsed = parseInstallArgs(args);
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
