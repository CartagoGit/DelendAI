import z from 'zod';

import type {
	IRunArgvOutcome,
	IToolRegistration,
} from '@mcp-vertex/core/public';
import { runArgv, toolJson } from '@mcp-vertex/core/public';

import { discoverRankedProviders } from '../services/discover-ranked-providers.service';
import { buildEscalationLadder } from '../escalate/build-ladder';
import { runWithEscalation } from '../escalate/run-with-escalation';
import {
	MAX_COST_QUALITY_TRADEOFF,
	MAX_TASK_TYPE_LENGTH,
} from '../contracts/constants/tradeoff.constant';
import type {
	IDiscoveryDeps,
	IMissingProvider,
	IProviderCandidate,
} from '../contracts/interfaces/roster.interface';
import type { IRunEscalationDeps } from '../contracts/interfaces/escalation.interface';
import type { IRosterSnapshotStore } from '../discovery/roster-store';
import { installKnownCli } from '../discovery/install-provider';

const MIN_COST_TIER = 1;
const MAX_COST_TIER = 5;
const MAX_ESCALATION_DEPTH = 10;

const RUNG_SCHEMA = z.object({
	step: z.number(),
	id: z.string(),
	label: z.string(),
	source: z.enum(['cli', 'api']),
	costTier: z.number(),
	rationale: z.string(),
});

const OUTPUT_SCHEMA = z.object({
	/** The ordered escalation plan: run step 1; on a gate failure, escalate. */
	ladder: z.array(RUNG_SCHEMA),
	costCeiling: z.number(),
	maxDepth: z.number(),
	costQualityTradeoff: z.number(),
	/** How to execute the plan (the selector plans; the host runs + gates). */
	howToExecute: z.string(),
	/** First safe install hint when the host cannot reach any provider. */
	nextInstall: z
		.object({ id: z.string(), label: z.string(), hint: z.string() })
		.nullable(),
	/** Present only after the caller explicitly requested an installation. */
	installation: z
		.object({
			providerId: z.string(),
			attempted: z.boolean(),
			ok: z.boolean(),
			code: z.number().nullable(),
			timedOut: z.boolean(),
			hint: z.string().nullable(),
		})
		.nullable(),
	/** Null unless the caller explicitly asked the tool to walk the ladder. */
	execution: z
		.object({
			ok: z.boolean(),
			chosen: z.object({ id: z.string(), label: z.string() }).nullable(),
			attempts: z.array(
				z.object({
					id: z.string(),
					passed: z.boolean(),
				}),
			),
		})
		.nullable(),
});

const INPUT_SCHEMA = z
	.object({
		task: z.string().min(1).optional(),
		costQualityTradeoff: z
			.number()
			.int()
			.min(0)
			.max(MAX_COST_QUALITY_TRADEOFF)
			.optional(),
		costCeiling: z
			.number()
			.int()
			.min(MIN_COST_TIER)
			.max(MAX_COST_TIER)
			.optional(),
		maxDepth: z.number().int().min(1).max(MAX_ESCALATION_DEPTH).optional(),
		pin: z.string().min(1).optional(),
		taskType: z.string().min(1).max(MAX_TASK_TYPE_LENGTH).optional(),
		install: z.boolean().optional(),
		installProviderId: z.string().min(1).optional(),
		execute: z.boolean().optional(),
		consent: z.boolean().optional(),
	})
	.superRefine((value, context) => {
		if (value.install === true && value.installProviderId === undefined) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'installProviderId is required when install is true',
				path: ['installProviderId'],
			});
		}
		if (value.execute !== true) return;
		if (value.consent !== true) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'consent must be true when execute is true',
				path: ['consent'],
			});
		}
		if (value.task === undefined) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'task is required when execute is true',
				path: ['task'],
			});
		}
	})
	.strict();

type IAutoRunInstallRunner = (
	argv: readonly [string, ...string[]],
) => Promise<IRunArgvOutcome>;

interface IAutoRunExecution {
	readonly ok: boolean;
	readonly chosen: { readonly id: string; readonly label: string } | null;
	readonly attempts: ReadonlyArray<{
		readonly id: string;
		readonly passed: boolean;
	}>;
}

const buildDefaultHandoff = (candidate: IProviderCandidate, task: string) => ({
	kind: 'handoff' as const,
	via: 'host-orchestrator-runner-invoke' as const,
	note: 'IMcpPluginContext does not expose a peer-tool invoke seam, so the host must execute orchestrator-runner invoke explicitly.',
	candidate: {
		id: candidate.id,
		label: candidate.label,
		source: candidate.source,
		costTier: candidate.costTier,
	},
	task,
});

const defaultRunProvider: IRunEscalationDeps['runProvider'] = async (
	candidate,
	task,
) => buildDefaultHandoff(candidate, task);

const defaultCheckAcceptance: IRunEscalationDeps['checkAcceptance'] =
	async () => false;

const buildPlan = (
	ranked: readonly IProviderCandidate[],
	args: {
		readonly costCeiling?: number | undefined;
		readonly maxDepth?: number | undefined;
	},
) => {
	const input = {
		ranked,
		...(args.costCeiling === undefined
			? {}
			: { costCeiling: args.costCeiling }),
		...(args.maxDepth === undefined ? {} : { maxDepth: args.maxDepth }),
	};
	return buildEscalationLadder(input);
};

const toExecution = (result: {
	readonly ok: boolean;
	readonly chosen: IProviderCandidate | null;
	readonly attempts: ReadonlyArray<{
		readonly candidate: IProviderCandidate;
		readonly passed: boolean;
	}>;
}): IAutoRunExecution => ({
	ok: result.ok,
	chosen:
		result.chosen === null
			? null
			: {
					id: result.chosen.id,
					label: result.chosen.label,
				},
	attempts: result.attempts.map((attempt) => ({
		id: attempt.candidate.id,
		passed: attempt.passed,
	})),
});

const selectNextInstall = (
	availableCount: number,
	nextMissingCli: IMissingProvider | undefined,
) =>
	availableCount === 0 && nextMissingCli !== undefined
		? {
				id: nextMissingCli.id,
				label: nextMissingCli.label,
				hint: nextMissingCli.hint,
			}
		: null;

/**
 * `auto_run` — plan the cheapest-capable → escalate-up route for a task.
 *
 * It discovers the roster, ranks by the cost↔quality dial (respecting a pin),
 * and returns the ordered ESCALATION LADDER: run the first (best-value)
 * provider; if its result fails the project's acceptance gate, escalate to the
 * next (stronger) one, never past the user's cost ceiling. Historically this
 * was plan-only because `runWithEscalation` existed but was not wired to the
 * tool, and the plugin runtime has no direct cross-plugin `callTool` seam.
 * Execution is therefore DIP-only: tests/hosts may inject a real runner +
 * acceptance gate; production defaults return a structured handoff and never
 * spend or execute on the user's behalf.
 */
export const buildAutoRunRegistration = (options: {
	readonly namespacePrefix: string;
	readonly defaultTradeoff: number;
	readonly deps?: IDiscoveryDeps;
	readonly taskPins?: Readonly<Record<string, string>>;
	readonly rosterStore?: IRosterSnapshotStore;
	/** Production uses the argv-only core runner; tests inject a fake. */
	readonly installRunner?: IAutoRunInstallRunner;
	/** Explicit workspace root for the optional installer; never implicit cwd. */
	readonly workspaceRoot?: string;
	/** Optional injected executor; production defaults to a structured handoff. */
	readonly runProvider?: IRunEscalationDeps['runProvider'];
	/** Optional injected acceptance gate; production defaults to "host must run it". */
	readonly checkAcceptance?: IRunEscalationDeps['checkAcceptance'];
}): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'auto_run',
		summary:
			'Plan the cheapest-capable → escalate-up route for a task (run step 1; on gate failure escalate to a stronger provider, within your cost ceiling).',
		tags: ['orchestration'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_auto_run`,
				{
					description:
						"Plan how to run a task cost-effectively with quality up-escalation. Returns an ordered ladder: run the first (best-value) provider for your cost↔quality dial; if its output fails the project's acceptance gate, escalate to the next (stronger) provider — never above your cost ceiling. When none is reachable, `nextInstall` returns an exact trusted command. Set `install:true` plus `installProviderId` only to explicitly run that command; without that explicit consent this tool never installs or spends. Set `execute:true` plus `consent:true` to walk the ladder through injected execution seams; by default production still returns a host-side handoff because plugins cannot invoke peer tools directly at runtime.",
					inputSchema: INPUT_SCHEMA,
					outputSchema: OUTPUT_SCHEMA,
				},
				async (args: {
					task?: string | undefined;
					costQualityTradeoff?: number | undefined;
					costCeiling?: number | undefined;
					maxDepth?: number | undefined;
					pin?: string | undefined;
					taskType?: string | undefined;
					install?: boolean | undefined;
					installProviderId?: string | undefined;
					execute?: boolean | undefined;
					consent?: boolean | undefined;
				}) => {
					const installation =
						args.install === true &&
						args.installProviderId !== undefined
							? await installKnownCli(
									args.installProviderId,
									options.installRunner ??
										((argv) =>
											runArgv(argv, {
												...(options.workspaceRoot !==
												undefined
													? {
															cwd: options.workspaceRoot,
														}
													: {}),
											})),
								)
							: null;
					const { roster, tradeoff, ranked } =
						await discoverRankedProviders({
							deps: options.deps,
							rosterStore: options.rosterStore,
							requestedTradeoff: args.costQualityTradeoff,
							defaultTradeoff: options.defaultTradeoff,
							pin: args.pin,
							taskType: args.taskType,
							taskPins: options.taskPins,
						});
					const candidates = ranked.map((result) => result.candidate);
					const plan = buildPlan(candidates, args);
					const nextMissingCli = roster.missing.find(
						(candidate) => candidate.source === 'cli',
					);
					const execution: IAutoRunExecution | null =
						args.execute === true && args.task !== undefined
							? await runWithEscalation(plan, args.task, {
									runProvider:
										options.runProvider ??
										defaultRunProvider,
									checkAcceptance:
										options.checkAcceptance ??
										defaultCheckAcceptance,
								}).then(toExecution)
							: null;
					return toolJson({
						ladder: plan.ladder.map((rung) => ({
							step: rung.step,
							id: rung.candidate.id,
							label: rung.candidate.label,
							source: rung.candidate.source,
							costTier: rung.candidate.costTier,
							rationale: rung.rationale,
						})),
						costCeiling: plan.costCeiling,
						maxDepth: plan.maxDepth,
						costQualityTradeoff: tradeoff,
						nextInstall: selectNextInstall(
							roster.available.length,
							nextMissingCli,
						),
						installation,
						execution,
						howToExecute:
							"Run step 1 via your provider (the orchestrator-runner `invoke` tool, or the CLI/API directly), then run the project's acceptance gate (`bun run validate` or the validation matrix). If it fails, run the next step; stop at the first pass or the end of the ladder. `execute:true` only walks injected seams; production still returns host-side handoffs because plugins cannot invoke peer tools directly.",
					});
				},
			);
		},
	};
};
