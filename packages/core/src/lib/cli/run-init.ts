import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

import { IDE_TARGETS } from '../install/ide-targets';
import {
	type IInstallOptions,
	type IInstallReport,
	type IRunnerVia,
	runInstall,
} from '../install/installer';

const VIAS = new Set<IRunnerVia>(['npx', 'bunx', 'pnpm', 'yarn', 'deno']);

/** Parse `init` flags: --ide=a,b --via=npx --preset=standard --all. */
export const parseInitArgs = (argv: readonly string[]): IInstallOptions => {
	const options: {
		-readonly [K in keyof IInstallOptions]: IInstallOptions[K];
	} = {};
	for (const arg of argv) {
		if (arg === '--all') options.all = true;
		else if (arg.startsWith('--ide=')) {
			options.ide = arg
				.slice(6)
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
		} else if (arg.startsWith('--via=')) {
			const via = arg.slice(6).trim();
			if (VIAS.has(via as IRunnerVia)) options.via = via as IRunnerVia;
		} else if (arg.startsWith('--preset='))
			options.preset = arg.slice(9).trim();
	}
	return options;
};

/** Detect WSL: a Linux userland under Windows reports platform 'linux'. */
export const detectIsWsl = (): boolean => {
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

/** Human-readable + structured install report. */
export const formatInstallReport = (report: IInstallReport): string => {
	const lines: string[] = [`OS: ${report.os.label}`];
	if (report.os.note) lines.push(`  ${report.os.note}`);
	if (report.results.length === 0) {
		lines.push(
			'No IDE/agent config detected here. Re-run with --ide=<id> (or --all):',
		);
		lines.push(`  available: ${IDE_TARGETS.map((t) => t.id).join(', ')}`);
		lines.push('  e.g. npx @mcp-vertex/core init --ide=vscode');
	} else {
		lines.push(
			report.detected ? 'Detected and configured:' : 'Configured:',
		);
		for (const r of report.results) {
			const mark = r.action === 'skipped' ? '–' : '✓';
			const detail = r.reason ? ` (${r.reason})` : '';
			lines.push(
				`  ${mark} ${r.label} [${r.action}]${detail}  ${r.path}`,
			);
		}
		lines.push('');
		lines.push(
			'mcp-vertex was merged in WITHOUT touching your other servers. Reload your IDE.',
		);
	}
	return `${lines.join('\n')}\n${JSON.stringify(report, null, 2)}\n`;
};

/** `mcp-vertex init …`: detect/merge our MCP server into IDE configs. */
export const runInit = async (
	argv: readonly string[],
	cwd: string,
): Promise<void> => {
	const options = parseInitArgs(argv);
	const report = await runInstall(
		{
			projectDir: cwd,
			home: homedir(),
			platform: process.platform,
			appData: process.env.APPDATA,
			isWsl: detectIsWsl(),
		},
		options,
	);
	process.stdout.write(formatInstallReport(report));
	if (!report.ok) process.exitCode = 1;
};
