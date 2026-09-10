/**
 * Every result these handlers return must satisfy the `outputSchema`
 * they registered.
 *
 * `dispatch.tool.spec.ts` asserts on fields of `structuredContent` but
 * never checks the result against the tool's own declared schema, and
 * that gap hid a tool that could not answer at all: `_dispatch` returned
 * `budget.consumedSubagents` as a `Map` where `PlanOutcomeSchema`
 * declares a record, so the MCP SDK rejected every SUCCESSFUL dispatch
 * with `-32602 ... expected record, received Map`. A `Map` serialises to
 * `{}` over JSON, so no client ever saw a dispatch outcome.
 *
 * This validates against the schema captured from `registerTool` rather
 * than an imported constant, so it checks what the server actually
 * declares — the same object the SDK validates against at runtime.
 */
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';

import { buildDispatchRegistration } from '../../../../src/lib/tools/dispatch.tool.js';
import { createOrchestratorEngine } from '../../../../src/lib/policy/policy.js';
import type { IDispatchPort } from '../../../../src/lib/dispatch/contracts.js';
import type { IOrchestratorPolicy } from '../../../../src/lib/policy/types.js';

const POLICY: IOrchestratorPolicy = {
	defaultMode: 'single',
	defaults: {
		budget: {
			maxTokensOrchestrator: 100_000,
			maxTokensPerSubagent: 10_000,
			timeoutMs: 0,
		},
		rotation: { maxIterationsPerSubagent: 3, allow: ['error-storm'] },
	},
};

/** A port that reports real subagent spend, so the budget is non-empty. */
const spendingPort: IDispatchPort = {
	spawnSubagent: async (input) => ({
		subagentId: input.slotId,
		tokensUsed: 10,
		output: 'ok',
		schemaOk: true,
		hadError: false,
	}),
};

interface ICaptured {
	readonly handlers: Record<string, (args: unknown) => Promise<unknown>>;
	readonly outputSchemas: Record<string, ZodType | undefined>;
}

const capture = async (): Promise<ICaptured> => {
	const engine = createOrchestratorEngine(POLICY);
	const registration = buildDispatchRegistration({
		namespacePrefix: 'ns',
		engine: () => engine,
		port: () => spendingPort,
	});
	const handlers: Record<string, (args: unknown) => Promise<unknown>> = {};
	const outputSchemas: Record<string, ZodType | undefined> = {};
	await registration.register({
		registerTool: (
			name: string,
			def: { outputSchema?: ZodType },
			fn: (args: unknown) => Promise<unknown>,
		) => {
			handlers[name] = fn;
			outputSchemas[name] = def.outputSchema;
		},
	} as never);
	return { handlers, outputSchemas };
};

const structuredOf = (res: unknown): unknown =>
	(res as { structuredContent?: unknown }).structuredContent;

describe('agent-orchestrator output contracts', () => {
	it('a spawn-heavy dispatch outcome validates against its own outputSchema', async () => {
		const { handlers, outputSchemas } = await capture();

		const res = await handlers.ns_dispatch!({
			task: {
				id: 'contract-task',
				description: 'Refactor several modules and verify.',
				tags: ['refactor'],
				hint: 'medium',
			},
			override: 'linear',
		});

		const parsed = outputSchemas.ns_dispatch!.safeParse(structuredOf(res));
		expect(
			parsed.success ? null : JSON.stringify(parsed.error.issues),
		).toBeNull();
	});

	it('counts the steps a spawn-only plan actually ran', async () => {
		const { handlers } = await capture();

		await handlers.ns_dispatch!({
			task: {
				id: 'steps-task',
				description: 'Refactor several modules and verify.',
				tags: ['refactor'],
				hint: 'medium',
			},
			override: 'linear',
		});
		const budget = structuredOf(
			await handlers.ns_budget!({ taskId: 'steps-task' }),
		) as { steps: number; consumedSubagents: Record<string, number> };

		// The step counter used to live inside `recordOrchestrator`, so a
		// plan made only of `spawn` steps reported 0 while its subagents
		// were charged for real work.
		expect(budget.steps).toBeGreaterThan(0);
		expect(Object.keys(budget.consumedSubagents).length).toBeGreaterThan(0);
	});

	it('the budget snapshot validates against its own outputSchema', async () => {
		const { handlers, outputSchemas } = await capture();

		await handlers.ns_dispatch!({
			task: { id: 'budget-task', description: 'Fix typo.', tags: [] },
		});
		const res = await handlers.ns_budget!({ taskId: 'budget-task' });

		const parsed = outputSchemas.ns_budget!.safeParse(structuredOf(res));
		expect(
			parsed.success ? null : JSON.stringify(parsed.error.issues),
		).toBeNull();
	});
});
