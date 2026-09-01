/**
 * `<ns>_dispatch` / `<ns>_budget` / `<ns>_plan_ref` handler tests.
 *
 * `dispatch-port-refusal.spec.ts` already proves the pure
 * `dispatchPortRefusal` mapping in isolation; this file proves the
 * three handlers actually wire it (and the per-taskId plan/outcome
 * cache) correctly end to end, without a real `McpServer`.
 */
import { describe, expect, it } from 'vitest';

import { buildDispatchRegistration } from '../../../../src/lib/tools/dispatch.tool.js';
import { createOrchestratorEngine } from '../../../../src/lib/policy/policy.js';
import { MissingDispatchPortError } from '../../../../src/lib/dispatch/port-resolution.helper.js';
import type {
	IDispatchPort,
	IPlanOutcome,
} from '../../../../src/lib/dispatch/contracts.js';
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

/** `single` mode never spawns a subagent, so this port must never be called. */
const unreachablePort: IDispatchPort = {
	spawnSubagent: () => {
		throw new Error('port must not be called for a single-mode plan');
	},
};

type Handlers = Record<string, (args: unknown) => Promise<unknown>>;

const captureHandlers = async (
	port: () => IDispatchPort,
	lastOutcome?: (taskId: string) => IPlanOutcome | undefined,
): Promise<Handlers> => {
	const engine = createOrchestratorEngine(POLICY);
	const registration = buildDispatchRegistration({
		namespacePrefix: 'ns',
		engine: () => engine,
		port,
		...(lastOutcome !== undefined ? { lastOutcome } : {}),
	});
	const handlers: Handlers = {};
	await registration.register({
		registerTool: (
			name: string,
			_def: unknown,
			fn: (args: unknown) => Promise<unknown>,
		) => {
			handlers[name] = fn;
		},
	} as never);
	return handlers;
};

const structured = (res: unknown): Record<string, unknown> | undefined =>
	(res as { structuredContent?: Record<string, unknown> }).structuredContent;

const TASK = { id: 't1', description: 'Fix typo.', tags: [] };

describe('ns_dispatch', () => {
	it('plans and runs a single-mode task to a successful outcome, without touching the port', async () => {
		const handlers = await captureHandlers(() => unreachablePort);
		const res = await handlers.ns_dispatch!({ task: TASK });
		expect(structured(res)?.ok).toBe(true);
	});

	it('returns the typed refusal envelope, not a throw, when the port cannot be resolved', async () => {
		const handlers = await captureHandlers(() => {
			throw new MissingDispatchPortError();
		});
		const res = (await handlers.ns_dispatch!({ task: TASK })) as {
			isError?: boolean;
		};
		expect(res.isError).toBe(true);
	});

	it('lets an unrelated error from the port factory keep propagating as a real throw', async () => {
		const handlers = await captureHandlers(() => {
			throw new Error('disk on fire');
		});
		await expect(handlers.ns_dispatch!({ task: TASK })).rejects.toThrow(
			'disk on fire',
		);
	});
});

describe('ns_budget', () => {
	it('returns zeroed defaults when no taskId is given', async () => {
		const handlers = await captureHandlers(() => unreachablePort);
		const res = await handlers.ns_budget!({});
		expect(structured(res)).toMatchObject({
			consumedOrchestrator: 0,
			steps: 0,
			exhausted: false,
		});
	});

	it('returns zeroed defaults for a taskId with no prior dispatch and no fallback configured', async () => {
		const handlers = await captureHandlers(() => unreachablePort);
		const res = await handlers.ns_budget!({ taskId: 'never-dispatched' });
		expect(structured(res)).toMatchObject({
			consumedOrchestrator: 0,
			steps: 0,
			exhausted: false,
		});
	});

	it('falls back to the injected lastOutcome() when the in-process cache has nothing for that taskId', async () => {
		const fallbackOutcome: IPlanOutcome = {
			mode: 'single',
			steps: [],
			budget: {
				consumedOrchestrator: 5,
				consumedSubagents: new Map(),
				steps: 1,
			},
			ok: true,
		};
		const handlers = await captureHandlers(
			() => unreachablePort,
			(taskId) => (taskId === 'recovered' ? fallbackOutcome : undefined),
		);
		const res = await handlers.ns_budget!({ taskId: 'recovered' });
		expect(structured(res)).toMatchObject({
			consumedOrchestrator: 5,
			steps: 1,
			exhausted: true, // mapBudget: exhausted iff consumedOrchestrator > 0
		});
	});

	it('reads the in-process cache directly after a real dispatch, ahead of any fallback', async () => {
		const handlers = await captureHandlers(() => unreachablePort);
		await handlers.ns_dispatch!({ task: TASK });
		const res = await handlers.ns_budget!({ taskId: TASK.id });
		expect(structured(res)?.steps).toBeGreaterThan(0);
	});
});

describe('ns_plan_ref', () => {
	it('returns a "no plan" placeholder when no taskId is given', async () => {
		const handlers = await captureHandlers(() => unreachablePort);
		const res = await handlers.ns_plan_ref!({});
		expect(structured(res)?.rationale).toBe('no plan');
	});

	it('returns a "no plan for that taskId" placeholder when the taskId was never dispatched', async () => {
		const handlers = await captureHandlers(() => unreachablePort);
		const res = await handlers.ns_plan_ref!({ taskId: 'never-dispatched' });
		expect(structured(res)?.rationale).toBe('no plan for that taskId');
	});

	it('returns the actual plan used by a prior dispatch for that taskId', async () => {
		const handlers = await captureHandlers(() => unreachablePort);
		await handlers.ns_dispatch!({ task: TASK });
		const res = await handlers.ns_plan_ref!({ taskId: TASK.id });
		expect(structured(res)?.mode).toBe('single');
		expect(structured(res)?.rationale).not.toMatch(/no plan/);
	});
});
