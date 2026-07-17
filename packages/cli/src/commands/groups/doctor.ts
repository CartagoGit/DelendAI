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
import type { McpVertexToolOutputs } from '@mcp-vertex/core/public';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import {
	generateCompletion,
	type Shell,
} from '../../lib/completion/completion.service';
import { analyzeConfigRoots } from '../../lib/doctor/analyze-config-roots.service';
import { data, positionalArg, request, usage } from './group-helpers';

type SectionStatus = 'ok' | 'warn' | 'error';

interface IDoctorSection {
	readonly name: string;
	readonly status: SectionStatus;
	readonly findings: readonly string[];
}

type IOverviewish = McpVertexToolOutputs['mcp-vertex_overview'];

/**
 * a00060: `overview.tools` is a union (`Array<...> | Record<string,
 * string[]>` — compact mode groups by plugin) per the GENERATED SDK
 * type. The previous hand-rolled `IOverviewish.tools?: readonly
 * unknown[]` only ever matched the array shape, so `overview.tools
 * ?.length` silently read `undefined` (→ 0) against the Record shape
 * `doctor` actually receives — `mcpv doctor` always reported "0
 * tool(s) registered" / a false `warn`, regardless of how many tools
 * were really loaded. This is the same drift class x00105/f00118 fixed
 * elsewhere: use the generated type, don't hand-roll the shape.
 */
const countTools = (tools: IOverviewish['tools'] | undefined): number => {
	if (tools === undefined) return 0;
	if (Array.isArray(tools)) return tools.length;
	return Object.values(tools).reduce((sum, names) => sum + names.length, 0);
};

/** Worst status wins: error > warn > ok. */
const rollup = (sections: readonly IDoctorSection[]): SectionStatus => {
	if (sections.some((s) => s.status === 'error')) return 'error';
	if (sections.some((s) => s.status === 'warn')) return 'warn';
	return 'ok';
};

/**
 * a00060: `doctor` returns its report via `data()`, which the CLI runner
 * only prints to stdout in `--json` mode (by design, to avoid the
 * duplicate-JSON-dump bug `init` used to have). Unlike `init`, `doctor`
 * never grew its own human-readable recap, so running `mcpv doctor`
 * without `--json` printed literally nothing — a "sectioned health
 * report" a human can't actually read. `printDoctorSummary` closes that
 * gap the same way `printInitHumanSummary` does for `init`: a pure
 * renderer + a thin stderr-writing wrapper, gated on `!ctx.globals.json`
 * so machine (`--json`) consumers still get exactly the structured
 * envelope on stdout and nothing else.
 */
export const renderDoctorSummary = (
	status: SectionStatus,
	sections: readonly IDoctorSection[],
): string => {
	const lines = [`doctor: ${status}`, ''];
	for (const section of sections) {
		lines.push(`  ${section.name} (${section.status})`);
		for (const finding of section.findings) lines.push(`    ${finding}`);
	}
	lines.push('');
	return lines.join('\n');
};

const CODE_BY_STATUS: Record<SectionStatus, ICliCommandResult['code']> = {
	ok: EXIT_CODE.OK,
	warn: EXIT_CODE.VALIDATION,
	error: EXIT_CODE.RUNTIME,
};

// a00064: the config-vs-reality preflight lives in lib/ (pure,
// fs-free) — see analyze-config-roots.service.ts for the rationale.
// Re-exported so doctor's spec exercises it alongside the command.
export { analyzeConfigRoots };

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

		// Config-vs-reality (a00064): configured roots must exist here.
		try {
			const configRaw = readFileSync(
				join(ctx.globals.workspace, 'mcp-vertex.config.json'),
				'utf8',
			);
			sections.push(
				analyzeConfigRoots(JSON.parse(configRaw), (rel) =>
					existsSync(join(ctx.globals.workspace, rel)),
				),
			);
		} catch {
			// No config file (defaults apply) or unparsable JSON — the
			// server-side diagnostics cover the latter; skip the section.
		}

		// Plugins + tools — derived from the live server overview.
		try {
			const overview = await request<IOverviewish>(
				ctx,
				'mcp-vertex_overview',
				{ compact: true },
			);
			const pluginCount = overview.plugins?.length ?? 0;
			const toolCount = countTools(overview.tools);
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
		if (!ctx.globals.json) {
			process.stderr.write(renderDoctorSummary(status, sections));
		}
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
		const names = (await registerAllCommands()).map(
			(command) => command.name,
		);
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
