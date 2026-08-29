/**
 * `agent-orchestrator_plan` handler tests.
 *
 * The tool wraps `OrchestratorEngine.plan()` with one extra piece of
 * behaviour: an optional per-call `override` that re-labels the plan
 * under a different mode name WITHOUT re-running the policy — this was
 * previously the exact shape of bug 1 in this plugin's history (an
 * option accepted by the schema but silently discarded by the
 * handler). These tests hold the three-way branch (valid override /
 * override equal to the natural mode / invalid override) to its
 * contract directly, without going through the full MCP transport.
 */
import { describe, expect, it } from 'vitest';

import { buildPlanToolRegistration } from '../../../../src/lib/tools/plan.tool.js';
import {
	createOrchestratorEngine,
	OrchestratorEngine,
} from '../../../../src/lib/policy/policy.js';
import { TaskClassifier } from '../../../../src/lib/classifier/task-classifier.js';
import { ModeRegistry } from '../../../../src/lib/policy/registry.js';
import type { IModeAdapter } from '../../../../src/lib/policy/registry.js';
import type {
	IModePlan,
	IOrchestratorPolicy,
	ITask,
} from '../../../../src/lib/policy/types.js';

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

const captureHandler = async () => {
	const engine = createOrchestratorEngine(POLICY);
	const registration = buildPlanToolRegistration({
		namespacePrefix: 'ns',
		engine: () => engine,
	});
	let handler:
		| ((args: unknown) => Promise<{
				structuredContent?: Record<string, unknown>;
		  }>)
		| undefined;
	await registration.register({
		registerTool: (_name: string, _def: unknown, fn: typeof handler) => {
			handler = fn;
		},
	} as never);
	if (handler === undefined) throw new Error('handler not captured');
	return handler;
};

const TASK = { id: 't1', description: 'Fix typo.', tags: [] };

describe('agent-orchestrator_plan — override handling', () => {
	it('plans through the configured default mode when no override is given', async () => {
		const handler = await captureHandler();
		const res = await handler({ task: TASK });
		expect(res.structuredContent?.mode).toBe('single');
	});

	it('re-labels the plan under a valid override mode different from the natural one', async () => {
		const handler = await captureHandler();
		const res = await handler({ task: TASK, override: 'linear' });
		expect(res.structuredContent?.mode).toBe('linear');
		expect(res.structuredContent?.rationale).toMatch(
			/caller override → linear/,
		);
	});

	it('leaves the plan untouched when the override equals the mode already chosen', async () => {
		const handler = await captureHandler();
		const res = await handler({ task: TASK, override: 'single' });
		expect(res.structuredContent?.mode).toBe('single');
		expect(res.structuredContent?.rationale).not.toMatch(/caller override/);
	});

	it('silently ignores an override the engine has no adapter registered for', async () => {
		// A syntactically valid mode name (passes the zod enum) but one the
		// HOST's engine never registered — the tool must fall back to the
		// natural plan instead of throwing or fabricating an unsupported mode.
		const singleStub: IModeAdapter = {
			id: 'single',
			accepts: () => true,
			plan: (task: ITask): IModePlan => ({
				mode: 'single',
				rationale: 'stub plan',
				steps: [
					{
						order: 1,
						kind: 'orchestrate',
						instruction: task.description,
					},
				],
				budget: POLICY.defaults.budget,
				rotation: POLICY.defaults.rotation,
			}),
		};
		const registry = new ModeRegistry();
		registry.register(singleStub);
		const engine = new OrchestratorEngine(
			registry,
			new TaskClassifier(),
			POLICY,
		);
		const registration = buildPlanToolRegistration({
			namespacePrefix: 'ns',
			engine: () => engine,
		});
		let handler:
			| ((args: unknown) => Promise<{
					structuredContent?: Record<string, unknown>;
			  }>)
			| undefined;
		await registration.register({
			registerTool: (
				_name: string,
				_def: unknown,
				fn: typeof handler,
			) => {
				handler = fn;
			},
		} as never);

		const res = await handler!({ task: TASK, override: 'swarm' });

		expect(res.structuredContent?.mode).toBe('single');
		expect(res.structuredContent?.rationale).toBe('stub plan');
	});
});
