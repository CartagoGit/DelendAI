import {
	createOrchestratorEngine,
	LinearDispatcher,
	type IDispatchPort,
} from '@delendai/agent-orchestrator/public';
import {
	toolError,
	toolJson,
	type IToolRegistration,
} from '@delendai/core/public';
import z from 'zod';

import { deriveAuditTasks, readAuditPlan } from '../plan-reader';
import type { IAuditOrchestratorDeps } from '../contracts';

const ModeSchema = z.enum(['single', 'linear', 'swarm', 'auto']);
const InputSchema = z
	.object({
		planPath: z.string().min(1),
		dryRun: z.boolean().optional(),
		mode: ModeSchema.optional(),
	})
	.strict();

const TaskSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string(),
	files: z.array(z.string()),
	dependsOn: z.array(z.string()),
});

const PreviewSchema = z.object({
	plan: z.object({
		id: z.string(),
		title: z.string(),
		status: z.string().optional(),
	}),
	tasks: z.array(TaskSchema),
	mode: ModeSchema,
	dryRun: z.literal(true),
});

const RunSchema = z.object({
	plan: z.object({
		id: z.string(),
		title: z.string(),
		status: z.string().optional(),
	}),
	tasks: z.array(TaskSchema),
	mode: ModeSchema,
	dryRun: z.literal(false),
	results: z.array(
		z.object({
			taskId: z.string(),
			ok: z.boolean(),
			outcome: z.unknown(),
		}),
	),
});

const taskToPlannerInput = (
	task: ReturnType<typeof deriveAuditTasks>[number],
) => ({
	id: task.id,
	description: task.description,
	tags: ['audit', 'implementation', 'proposal'],
	hint: 'large' as const,
});

export const buildOrchestratePlanRegistration = (
	deps: IAuditOrchestratorDeps,
): IToolRegistration => ({
	id: 'orchestrate_plan',
	tags: ['audit', 'orchestration', 'read-only'],
	summary:
		'Derive and preview implementation tasks from an audit plan proposal.',
	register: async (server) => {
		server.registerTool(
			`${deps.namespacePrefix}_orchestrate_plan`,
			{
				description:
					'Read a type: plan audit proposal and return the ordered implementation tasks that would be delegated to subagents. Read-only.',
				inputSchema: InputSchema,
				outputSchema: PreviewSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				try {
					const plan = await readAuditPlan(
						deps.workspace,
						args.planPath,
					);
					const tasks = deriveAuditTasks(plan);
					const mode = args.mode ?? 'auto';
					return toolJson({
						plan: {
							id: plan.id,
							title: plan.title,
							...(plan.status ? { status: plan.status } : {}),
						},
						tasks,
						mode,
						dryRun: true,
					});
				} catch (error) {
					return toolError(
						'audit-plan-read-failed',
						error instanceof Error ? error.message : String(error),
					);
				}
			},
		);
	},
});

export const buildOrchestrateRunRegistration = (
	deps: IAuditOrchestratorDeps,
): IToolRegistration => ({
	id: 'orchestrate_run',
	tags: ['audit', 'orchestration', 'subagent', 'write'],
	summary:
		'Execute implementation tasks derived from an audit plan through the host subagent port.',
	register: async (server) => {
		server.registerTool(
			`${deps.namespacePrefix}_orchestrate_run`,
			{
				description:
					'Execute implementation tasks from a type: plan audit proposal through the host-injected subagent dispatcher. dryRun defaults to true; real execution requires an explicit dispatchPortFactory.',
				inputSchema: InputSchema,
				outputSchema: z.union([PreviewSchema, RunSchema]),
			},
			async (args: z.infer<typeof InputSchema>) => {
				try {
					const plan = await readAuditPlan(
						deps.workspace,
						args.planPath,
					);
					const tasks = deriveAuditTasks(plan);
					const mode = args.mode ?? 'auto';
					const base = {
						plan: {
							id: plan.id,
							title: plan.title,
							...(plan.status ? { status: plan.status } : {}),
						},
						tasks,
						mode,
					};
					if (args.dryRun !== false)
						return toolJson({ ...base, dryRun: true });
					if (deps.dispatchPort === undefined) {
						return toolError(
							'dispatch-port-not-configured',
							'Configure the host dispatchPortFactory before disabling dryRun.',
						);
					}
					const port: IDispatchPort = deps.dispatchPort();
					const engine = createOrchestratorEngine({
						defaultMode: mode,
						defaults: {
							budget: {
								maxTokensOrchestrator: 200_000,
								maxTokensPerSubagent: 50_000,
								timeoutMs: 0,
							},
							rotation: {
								maxIterationsPerSubagent: 3,
								allow: [
									'token-budget-exhausted',
									'schema-violation',
									'repeated-output',
									'error-storm',
								],
							},
						},
					});
					const results = [];
					for (const task of tasks) {
						const planResult = engine.plan(
							taskToPlannerInput(task),
						);
						const outcome = await new LinearDispatcher(
							planResult,
							port,
							task.id,
						).run();
						results.push({
							taskId: task.id,
							ok: outcome.ok,
							outcome,
						});
						if (!outcome.ok) break;
					}
					return toolJson({ ...base, dryRun: false, results });
				} catch (error) {
					return toolError(
						'audit-orchestration-failed',
						error instanceof Error ? error.message : String(error),
					);
				}
			},
		);
	},
});
