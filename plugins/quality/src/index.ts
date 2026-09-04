import {
	compactOutputSchema,
	createWorkspaceFileReader,
	definePlugin,
	toolError,
	toolJson,
} from '@delendai/core/public';
import type {
	FindingSeverity,
	IFinding,
	IFindingCounts,
	IToolRegistration,
} from '@delendai/core/public';
import z from 'zod';

import { createCommandRunner } from './lib/services/runner';
import { buildRunAllToolRegistration } from './lib/services/run-all';
import { buildQualityToolRegistrations } from './lib/tools';
import { runScope } from './lib/services/runner';
import { resolveScopes } from './lib/services/scopes';

const FINDING_SEVERITIES = [
	'critical',
	'high',
	'medium',
	'low',
	'info',
] as const satisfies readonly FindingSeverity[];

const qualityFindingSchema = z.object({
	ruleId: z.string(),
	severity: z.enum(FINDING_SEVERITIES),
	message: z.string(),
	location: z
		.object({
			file: z.string(),
			line: z.number().optional(),
			endLine: z.number().optional(),
		})
		.optional(),
	fix: z.string().optional(),
});

const plannerOutputSchema = z.object({
	ok: z.boolean(),
	severities: z.object({
		critical: z.number(),
		high: z.number(),
		medium: z.number(),
		low: z.number(),
		info: z.number(),
	}),
	worst: z.enum([...FINDING_SEVERITIES, 'none']),
	findings: z.array(qualityFindingSchema),
});

export interface IValidateOutputSnapshot {
	readonly findings?: readonly IFinding[];
	readonly severities?: Partial<Record<FindingSeverity, number>>;
	readonly worst?: FindingSeverity | 'none';
}

export interface IValidateOutputReader {
	readRecentValidateOutput(): Promise<IValidateOutputSnapshot | string>;
}

interface IRunQualityPlannerArgs {
	readonly severities?: readonly FindingSeverity[] | undefined;
}

interface IRunQualityPlannerDeps {
	readonly validateOutputReader: IValidateOutputReader;
}

const emptyFindingCounts = (): IFindingCounts => ({
	critical: 0,
	high: 0,
	medium: 0,
	low: 0,
	info: 0,
});

const normalizeFindingCounts = (
	findings: readonly IFinding[],
): IFindingCounts => {
	const counts = { ...emptyFindingCounts() } as Record<
		FindingSeverity,
		number
	>;
	for (const finding of findings) counts[finding.severity] += 1;
	return counts;
};

const resolveWorstSeverity = (
	counts: IFindingCounts,
): FindingSeverity | 'none' => {
	for (const severity of FINDING_SEVERITIES) {
		if (counts[severity] > 0) return severity;
	}
	return 'none';
};

const parseValidateOutputSnapshot = (
	raw: IValidateOutputSnapshot | string,
): IValidateOutputSnapshot => {
	if (typeof raw !== 'string') return raw;
	try {
		const parsed = JSON.parse(raw) as IValidateOutputSnapshot;
		return typeof parsed === 'object' && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
};

export const runQualityFromValidateOutput = async (
	args: IRunQualityPlannerArgs,
	deps: IRunQualityPlannerDeps,
): Promise<z.infer<typeof plannerOutputSchema>> => {
	const requested = new Set(args.severities ?? FINDING_SEVERITIES);
	const snapshot = parseValidateOutputSnapshot(
		await deps.validateOutputReader.readRecentValidateOutput(),
	);
	const findings = (snapshot.findings ?? []).filter((finding) =>
		requested.has(finding.severity),
	);
	const severities = normalizeFindingCounts(findings);
	return {
		ok: findings.length === 0,
		severities,
		worst: resolveWorstSeverity(severities),
		findings,
	};
};

const buildRunQualityToolRegistration = (
	qualityOptions: Parameters<typeof buildQualityToolRegistrations>[0],
	validateOutputReader?: IValidateOutputReader,
): IToolRegistration => ({
	id: 'run_quality',
	effects: ['spawn'],
	summary:
		'Run a quality scope or scan the most recent validate output for findings.',
	tags: ['quality'],
	register: async (server) => {
		server.registerTool(
			`${qualityOptions.namespacePrefix}_run_quality`,
			{
				description:
					'With `scope`, execute a quality scope and return a structured pass/fail report. Pass `dryRun: true` to resolve the scope and list commands without spawning them. Without `scope`, and when a validate-output reader is injected, scan the most recent validate findings and return severity-filtered results.',
				inputSchema: z.object({
					scope: z.string().optional(),
					dryRun: z.boolean().optional(),
					severities: z.array(z.enum(FINDING_SEVERITIES)).optional(),
				}),
				// v00131: the handler never validates its return payload against
				// this declared wire schema, so `tools/list` can advertise the
				// compact envelope while preserving the real structuredContent.
				outputSchema: compactOutputSchema(),
			},
			async (args: {
				scope?: string | undefined;
				dryRun?: boolean | undefined;
				severities?: FindingSeverity[] | undefined;
			}) => {
				if (
					validateOutputReader !== undefined &&
					args.scope === undefined &&
					args.dryRun !== true
				) {
					return toolJson(
						await runQualityFromValidateOutput(
							{
								...(args.severities !== undefined
									? { severities: args.severities }
									: {}),
							},
							{ validateOutputReader },
						),
					);
				}

				const scopes = await resolveScopes(
					qualityOptions.reader,
					qualityOptions.optionScopes
						? { scopes: qualityOptions.optionScopes }
						: {},
				);
				const names = Object.keys(scopes);
				if (names.length === 0) {
					return toolError(
						'no quality scopes configured',
						'Add scripts to package.json, a validationMatrix to mcp-vertex.config.json, or `scopes` to the plugin options.',
					);
				}
				const scope =
					args.scope ??
					(names.includes('all') ? 'all' : (names[0] as string));
				const commands = scopes[scope];
				if (commands === undefined) {
					return toolError(
						`unknown scope "${scope}"`,
						`Available: ${names.join(', ')}.`,
					);
				}
				if (args.dryRun === true) {
					return toolJson({
						scope,
						ok: true,
						dryRun: true,
						commands: commands.map((command) => command.command),
					});
				}
				return toolJson(
					await runScope(
						scope,
						commands,
						qualityOptions.workspaceRoot,
						qualityOptions.run,
						qualityOptions.commandPolicy,
					),
				);
			},
		);
	},
});

/**
 * Quality-gate runner. Executes the project's validation commands
 * (lint/test/build/typecheck) per scope and returns a structured
 * pass/fail report. Commands come from plugin options, the config's
 * validationMatrix, or package.json scripts. Load with
 * `mcp-vertex --plugins=quality`.
 */
export default definePlugin({
	name: 'quality',
	version: '0.1.1',
	describe:
		'Run the project quality gates (lint/test/build/typecheck) per scope and return structured pass/fail.',
	optionsSchema: z.object({
		/** scope name → ordered shell commands. */
		scopes: z.record(z.string(), z.array(z.string())).optional(),
		timeoutMs: z.number().optional(),
		/** Allow/deny which binaries `run_quality` may spawn (trust boundary). */
		commandPolicy: z
			.object({
				allow: z.array(z.string()).optional(),
				deny: z.array(z.string()).optional(),
			})
			.optional(),
	}),
	register(ctx) {
		const reader = createWorkspaceFileReader(ctx.workspace);
		const timeoutMs = ctx.options.timeoutMs;
		const qualityOptions = {
			namespacePrefix: ctx.namespacePrefix,
			reader,
			workspaceRoot: ctx.workspace.root,
			run: createCommandRunner(
				typeof timeoutMs === 'number' ? timeoutMs : undefined,
			),
			...(ctx.options.scopes
				? {
						optionScopes: ctx.options.scopes as Record<
							string,
							readonly string[]
						>,
					}
				: {}),
			...(ctx.options.commandPolicy
				? { commandPolicy: ctx.options.commandPolicy }
				: {}),
			// f00154 S3 — wire the incident sink. Every `toolError`
			// in the quality tool handlers emits one structured
			// incident on the JSONL streams (or console fallback).
			...(ctx.logsSink ? { logsSink: ctx.logsSink } : {}),
		};
		const validateOutputReader = (
			ctx.options as { validateOutputReader?: IValidateOutputReader }
		).validateOutputReader;
		const qualityTools = buildQualityToolRegistrations(qualityOptions);
		const getQualityScopesTool = qualityTools.find(
			(tool) => tool.id === 'get_quality_scopes',
		);
		const qualityCancelTool = qualityTools.find(
			(tool) => tool.id === 'quality_cancel',
		);
		return {
			tools: [
				...(getQualityScopesTool !== undefined
					? [getQualityScopesTool]
					: []),
				buildRunQualityToolRegistration(
					qualityOptions,
					validateOutputReader,
				),
				...(qualityCancelTool !== undefined ? [qualityCancelTool] : []),
				buildRunAllToolRegistration(qualityOptions),
			],
			knowledge: [
				{
					id: 'quality-gates',
					title: 'Quality gates',
					body: [
						'# Quality gates',
						'',
						`Tools: \`${ctx.namespacePrefix}_get_quality_scopes\` (list), \`${ctx.namespacePrefix}_run_quality\` (execute one scope), \`${ctx.namespacePrefix}_quality_run_all\` (execute every configured scope, one aggregated report).`,
						'',
						'- Before closing work, run the relevant scope and ensure it passes.',
						'- Scopes come from plugin options → mcp-vertex.config.json validationMatrix → package.json scripts.',
						'- `run_quality` executes real commands; read the per-command `ok`/`tail` to fix failures.',
					].join('\n'),
				},
			],
		};
	},
});
