/**
 * f00046 S10 — `doctor` + `completion` commands.
 *
 * `doctor` combines read-only signals (server overview + workspace
 * filesystem checks) into a sectioned health report with a CI-friendly
 * exit code:
 *   0 = all OK (no P0 findings)
 *   4 (VALIDATION) = warn-only — non-fatal quality regression
 *   5 (RUNTIME)    = error — at least one P0 finding
 *
 * `--json` returns `{ status, sections, score }`. `score` is the
 * f00191 / q00006 Track I addition: a 0–100 number + P0/P1/P2 bucket
 * lists.
 *
 * `completion <shell>` prints a shell-completion script derived
 * dynamically from `registerAllCommands()` so it can never drift.
 */
import type { IOverview } from '@delendai/client/public';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../../contracts/interfaces/cli-command.interface';
import {
	generateCompletion,
	type Shell,
} from '../../lib/completion/completion.service';
import { analyzeConfigRoots } from '../../lib/doctor/analyze-config-roots.service';
import {
	runDoctorChecks,
	type IDoctorRunnerOptions,
} from '../../lib/doctor/runner';
import { computeScore, type IDoctorScore } from '../../lib/doctor/score';
import type {
	DoctorCheck,
	DoctorSectionStatus,
	IDoctorSection,
} from '../../lib/doctor/types';
import { data, positionalArg, request, usage } from './group-helpers';

type SectionStatus = DoctorSectionStatus;

type IOverviewish = IOverview;

/**
 * a00060: `overview.tools` is a union (`Array<...> | Record<string,
 * string[]>` — compact mode groups by plugin). The previous hand-rolled
 * `IOverviewish.tools?: readonly unknown[]` only ever matched the array
 * shape, so `overview.tools?.length` silently read `undefined` (→ 0)
 * against the Record shape `doctor` actually receives — `mcpv doctor`
 * always reported "0 tool(s) registered" / a false `warn`, regardless
 * of how many tools were really loaded. This is the same drift class
 * x00105/f00118 fixed elsewhere: use ONE shared type, don't hand-roll
 * the shape per call site.
 *
 * v00129 S1 (AUD-B01): that one shared type used to be the generated
 * `McpVertexToolOutputs['mcp-vertex_overview']` (derived straight from
 * the wire-declared `outputSchema`). `overview`'s `outputSchema` is now
 * a deliberately permissive `compactOutputSchema()` to save tokens —
 * see `packages/core/src/lib/surface/compact-output-schema.ts` — so it
 * no longer carries this shape. `@delendai/client`'s `IOverview` is
 * the new single source of truth: a hand-kept interface next to the
 * client code that actually calls `overview` and depends on its real
 * shape, kept in sync with `overview-tool.ts`'s handler. This module
 * imports that one, rather than re-deriving its own.
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

const CODE_BY_STATUS: Record<SectionStatus, ICliCommandResult['code']> = {
	ok: EXIT_CODE.OK,
	warn: EXIT_CODE.VALIDATION,
	error: EXIT_CODE.RUNTIME,
};

// The config-vs-reality preflight lives in lib/ (pure,
// fs-free) — see analyze-config-roots.service.ts for the rationale.
// Re-exported so doctor's spec exercises it alongside the command.
export { analyzeConfigRoots };

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
 *
 * f00191: when `score` is provided, the renderer adds a top-level
 * `Health: NN/100` line + P0/P1/P2 priority buckets. The legacy
 * shape (no `score`) is still rendered so older consumers / the
 * existing spec keep working.
 */
export const renderDoctorSummary = (
	status: SectionStatus,
	sections: readonly IDoctorSection[],
	score?: IDoctorScore,
): string => {
	const lines: string[] = [];
	if (score !== undefined) {
		lines.push(`Health: ${score.value}/100`);
		lines.push('');
	}
	lines.push(`doctor: ${status}`, '');
	for (const section of sections) {
		lines.push(`  ${section.name} (${section.status})`);
		for (const finding of section.findings) lines.push(`    ${finding}`);
	}
	if (score !== undefined) {
		lines.push('');
		lines.push('P0 (must fix):');
		lines.push(
			score.p0.length === 0 ? '  none' : `  ${score.p0.join('\n  ')}`,
		);
		lines.push('P1 (should fix):');
		lines.push(
			score.p1.length === 0 ? '  none' : `  ${score.p1.join('\n  ')}`,
		);
		lines.push('P2 (cosmetic):');
		lines.push(
			score.p2.length === 0 ? '  none' : `  ${score.p2.join('\n  ')}`,
		);
		lines.push('');
	}
	return lines.join('\n');
};

/**
 * Run the doctor body — pure over the context + injectable options so
 * tests can swap in their own `extraChecks`. `ICliCommand.run` is a
 * `(args, ctx) => Promise<ICliCommandResult>` thunk; we wrap
 * `runDoctorBody` so the CLI surface stays unchanged.
 */
export interface IRunDoctorOptions {
	/**
	 * Optional override for the pure check list. When provided, replaces
	 * the default checks entirely (does not append). Tests pass `[]`
	 * to skip all five pure sections; production passes `undefined`
	 * to use the defaults baked into `runDoctorChecks`.
	 */
	readonly extraChecks?: readonly DoctorCheck[] | undefined;
}

export const runDoctorBody = async (
	ctx: ICliCommandContext,
	options: IRunDoctorOptions = {},
): Promise<ICliCommandResult> => {
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

	// Pure workspace checks (f00191): manifests, runtime, git-status,
	// stale-docs, permissions. These do NOT need the server — they
	// inspect the workspace tree directly. A check that throws is
	// already swallowed by `runDoctorChecks`.
	const runnerOptions: IDoctorRunnerOptions =
		options.extraChecks !== undefined
			? {
					workspace: ctx.globals.workspace,
					extraChecks: options.extraChecks,
				}
			: { workspace: ctx.globals.workspace };
	const pureSections = await runDoctorChecks(runnerOptions);
	for (const section of pureSections) sections.push(section);

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
	const score = computeScore(sections);
	if (!ctx.globals.json) {
		process.stderr.write(renderDoctorSummary(status, sections, score));
	}
	return data({ status, sections, score }, CODE_BY_STATUS[status]);
};

const doctorCommand: ICliCommand = {
	name: 'doctor',
	summary:
		'Sectioned health report (env, config, manifests, runtime, plugins, tools) + exit code + 0–100 score.',
	async run(_args, ctx) {
		return runDoctorBody(ctx);
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
