import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { discoverAndPersistRoster } from '../discovery/discover-roster';
import { realDiscoveryDeps } from '../discovery/real-deps';
import { rankProviders } from '../routing/rank-providers';
import { buildEscalationLadder } from '../escalate/build-ladder';
import { resolveTaskPin } from '../prefs/resolve-task-pin';
import type { IDiscoveryDeps } from '../contracts/interfaces/roster.interface';
import type { IRosterSnapshotStore } from '../discovery/roster-store';

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
});

/**
 * `auto_run` — plan the cheapest-capable → escalate-up route for a task.
 *
 * It discovers the roster, ranks by the cost↔quality dial (respecting a pin),
 * and returns the ordered ESCALATION LADDER: run the first (best-value)
 * provider; if its result fails the project's acceptance gate, escalate to the
 * next (stronger) one, never past the user's cost ceiling. Execution + the
 * gate are the host's job (orchestrator-runner's `invoke` + the validation
 * matrix), so this stays headless, deterministic and spend-free — the
 * escalation LOGIC without spawning anything from here.
 */
export const buildAutoRunRegistration = (options: {
	readonly namespacePrefix: string;
	readonly defaultTradeoff: number;
	readonly deps?: IDiscoveryDeps;
	readonly taskPins?: Readonly<Record<string, string>>;
	readonly rosterStore?: IRosterSnapshotStore;
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
						"Plan how to run a task cost-effectively with quality up-escalation. Returns an ordered ladder: run the first (best-value) provider for your cost↔quality dial; if its output fails the project's acceptance gate, escalate to the next (stronger) provider — never above your cost ceiling. Pass `costCeiling` (1…5, the priciest tier escalation may reach), `maxDepth` (how many rungs), `costQualityTradeoff` (0 strongest … 10 cheapest) and `pin`. The selector PLANS; you execute each rung (e.g. via the orchestrator-runner `invoke` tool) and run your acceptance gate between rungs. Headless and spend-free.",
					inputSchema: z
						.object({
							task: z.string().min(1).optional(),
							costQualityTradeoff: z
								.number()
								.int()
								.min(0)
								.max(10)
								.optional(),
							costCeiling: z
								.number()
								.int()
								.min(1)
								.max(5)
								.optional(),
							maxDepth: z
								.number()
								.int()
								.min(1)
								.max(10)
								.optional(),
							pin: z.string().min(1).optional(),
							taskType: z.string().min(1).max(80).optional(),
						})
						.strict(),
					outputSchema: OUTPUT_SCHEMA,
				},
				async (args: {
					task?: string | undefined;
					costQualityTradeoff?: number | undefined;
					costCeiling?: number | undefined;
					maxDepth?: number | undefined;
					pin?: string | undefined;
					taskType?: string | undefined;
				}) => {
					const roster = await discoverAndPersistRoster(
						options.deps ?? realDiscoveryDeps(),
						options.rosterStore,
					);
					const tradeoff =
						args.costQualityTradeoff ?? options.defaultTradeoff;
					const ranked = rankProviders({
						available: roster.available,
						costQualityTradeoff: tradeoff,
						pinnedId: resolveTaskPin(
							args.pin,
							args.taskType,
							options.taskPins,
						),
					}).map((r) => r.candidate);
					const plan = buildEscalationLadder({
						ranked,
						...(args.costCeiling !== undefined
							? { costCeiling: args.costCeiling }
							: {}),
						...(args.maxDepth !== undefined
							? { maxDepth: args.maxDepth }
							: {}),
					});
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
						howToExecute:
							"Run step 1 via your provider (the orchestrator-runner `invoke` tool, or the CLI/API directly), then run the project's acceptance gate (`bun run validate` or the validation matrix). If it fails, run the next step; stop at the first pass or the end of the ladder.",
					});
				},
			);
		},
	};
};
