/**
 * f00046 S10 — `doctor` + `completion` commands.
 *
 * `doctor` combines read-only signals (server overview) into a sectioned
 * health report with a CI-friendly exit code: 0 = all OK, 1 = warnings,
 * 2 = errors (the same ladder as `quality run-all`). `--json` returns
 * `{ sections: [{ name, status, findings }] }`.
 *
 * `completion <shell>` prints a shell-completion script derived
 * dynamically from `registerAllCommands()` so it can never drift.
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import {
	generateCompletion,
	type Shell,
} from '../../lib/completion/completion';
import { data, positionalArg, request, usage } from './group-helpers';

type SectionStatus = 'ok' | 'warn' | 'error';

interface IDoctorSection {
	readonly name: string;
	readonly status: SectionStatus;
	readonly findings: readonly string[];
}

interface IOverviewish {
	readonly plugins?: readonly unknown[];
	readonly tools?: readonly unknown[];
	readonly pluginDiagnostic?: {
		readonly missing?: readonly string[];
		readonly errors?: number;
	};
}

/** Worst status wins: error > warn > ok. */
const rollup = (sections: readonly IDoctorSection[]): SectionStatus => {
	if (sections.some((s) => s.status === 'error')) return 'error';
	if (sections.some((s) => s.status === 'warn')) return 'warn';
	return 'ok';
};

const CODE_BY_STATUS: Record<SectionStatus, ICliCommandResult['code']> = {
	ok: EXIT_CODE.OK,
	warn: EXIT_CODE.VALIDATION,
	error: EXIT_CODE.RUNTIME,
};

const doctorCommand: ICliCommand = {
	name: 'doctor',
	summary:
		'Sectioned health report (env, config, plugins, tools) + exit code.',
	async run(_args, ctx) {
		const sections: IDoctorSection[] = [];

		// Environment — workspace resolution is always available.
		sections.push({
			name: 'env',
			status: 'ok',
			findings: [`workspace: ${ctx.globals.workspace}`],
		});

		// Plugins + tools — derived from the live server overview.
		try {
			const overview = await request<IOverviewish>(
				ctx,
				'mcp-vertex_overview',
				{ compact: true },
			);
			const pluginCount = overview.plugins?.length ?? 0;
			const toolCount = overview.tools?.length ?? 0;
			const missing = overview.pluginDiagnostic?.missing ?? [];
			const loadErrors = overview.pluginDiagnostic?.errors ?? 0;
			sections.push({
				name: 'plugins',
				status: missing.length > 0 || loadErrors > 0 ? 'warn' : 'ok',
				findings: [
					`${pluginCount} plugin(s) loaded`,
					...(missing.length > 0
						? [`missing: ${missing.join(', ')}`]
						: []),
					...(loadErrors > 0 ? [`${loadErrors} load error(s)`] : []),
				],
			});
			sections.push({
				name: 'tools',
				status: toolCount > 0 ? 'ok' : 'warn',
				findings: [`${toolCount} tool(s) registered`],
			});
		} catch (error) {
			sections.push({
				name: 'plugins',
				status: 'error',
				findings: [
					`could not reach the server: ${error instanceof Error ? error.message : String(error)}`,
				],
			});
		}

		const status = rollup(sections);
		return data({ status, sections }, CODE_BY_STATUS[status]);
	},
};

const SHELLS: readonly Shell[] = ['bash', 'zsh', 'fish'];

const completionCommand: ICliCommand = {
	name: 'completion',
	summary: 'Print a shell-completion script (bash|zsh|fish) for mcpv.',
	async run(args, _ctx) {
		const shell = positionalArg(args);
		if (shell === undefined || !SHELLS.includes(shell as Shell)) {
			return usage('completion <bash|zsh|fish>');
		}
		// Lazy import to avoid a static cycle (the registry imports this group).
		const { registerAllCommands } = await import('../registry');
		const names = registerAllCommands().map((command) => command.name);
		return {
			code: EXIT_CODE.OK,
			text: generateCompletion(shell as Shell, names),
		};
	},
};

export const doctorCommands: readonly ICliCommand[] = [
	doctorCommand,
	completionCommand,
];
