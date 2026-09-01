/**
 * Integration coverage: `LinearDispatcher` must emit `dispatch.start`
 * / `dispatch.end` / `rotate` telemetry that a host actually reads
 * back through `ns_events` — not just that the builders in
 * `telemetry/event.ts` produce the right shape in isolation (that's
 * `event.spec.ts`), but that a real `ns_dispatch` call, wired through
 * `buildDispatchRegistration` and `buildReadOnlyToolRegistration`
 * sharing one sink, actually lands events the tool surface can see.
 */
import { describe, expect, it } from 'vitest';

import { buildDispatchRegistration } from '../../../../src/lib/tools/dispatch.tool.js';
import { buildReadOnlyToolRegistration } from '../../../../src/lib/tools/telemetry.tool.js';
import { createOrchestratorEngine } from '../../../../src/lib/policy/policy.js';
import { TaskClassifier } from '../../../../src/lib/classifier/task-classifier.js';
import { InMemoryTelemetrySink } from '../../../../src/lib/telemetry/event.js';
import { FakeDispatchPort } from '../../../../src/lib/dispatch/fake-port.js';
import type { IFakeScriptStep } from '../../../../src/lib/dispatch/fake-port.js';
import type { ITelemetryEvent } from '../../../../src/lib/telemetry/event.js';
import type { IOrchestratorPolicy } from '../../../../src/lib/policy/types.js';

const POLICY: IOrchestratorPolicy = {
	defaultMode: 'linear',
	defaults: {
		budget: {
			maxTokensOrchestrator: 100_000,
			maxTokensPerSubagent: 10_000,
			timeoutMs: 0,
		},
		rotation: {
			maxIterationsPerSubagent: 5,
			allow: ['repeated-output', 'error-storm'],
		},
	},
};

type Handlers = Record<string, (args: unknown) => Promise<unknown>>;

/** Wire `_dispatch` and `_events` off one shared sink, the way a real
 *  host must (see `index.ts`). Returns both tools' handlers so a test
 *  can dispatch, then read the event log back. */
const buildSharedHandlers = async (
	fakePort: FakeDispatchPort,
): Promise<{ handlers: Handlers; telemetry: InMemoryTelemetrySink }> => {
	const engine = createOrchestratorEngine(POLICY);
	const telemetry = new InMemoryTelemetrySink();
	const handlers: Handlers = {};
	const registerTool = (
		name: string,
		_def: unknown,
		fn: (args: unknown) => Promise<unknown>,
	): void => {
		handlers[name] = fn;
	};

	await buildDispatchRegistration({
		namespacePrefix: 'ns',
		engine: () => engine,
		port: () => fakePort,
		telemetry,
	}).register({ registerTool } as never);

	await buildReadOnlyToolRegistration({
		namespacePrefix: 'ns',
		classifier: new TaskClassifier(),
		telemetry,
		policyDefaultMode: () => POLICY.defaultMode,
	}).register({ registerTool } as never);

	return { handlers, telemetry };
};

const structured = (res: unknown): Record<string, unknown> | undefined =>
	(res as { structuredContent?: Record<string, unknown> }).structuredContent;

const readEvents = async (
	handlers: Handlers,
): Promise<readonly ITelemetryEvent[]> => {
	const res = await handlers.ns_events!({});
	return (structured(res)?.events ?? []) as readonly ITelemetryEvent[];
};

function badOutput(s: string): IFakeScriptStep {
	return { output: s, tokensUsed: 5, schemaOk: true, hadError: false };
}

describe('dispatch lifecycle telemetry reaches ns_events', () => {
	it('emits a matched dispatch.start/dispatch.end pair per subagent invocation on a clean run', async () => {
		const { handlers } = await buildSharedHandlers(new FakeDispatchPort());

		await handlers.ns_dispatch!({
			task: { id: 'task-clean', description: 'do the thing', tags: [] },
		});

		const events = await readEvents(handlers);
		const starts = events.filter(
			(e) => e.kind === 'dispatch.start' && e.taskId === 'task-clean',
		);
		const ends = events.filter(
			(e) => e.kind === 'dispatch.end' && e.taskId === 'task-clean',
		);
		// Two spawn steps (scout, implementer) × 3 accepted iterations
		// each (warmup + baseline + accepted candidate — see
		// `linear-dispatcher.spec.ts`); `verify` never touches the port.
		expect(starts).toHaveLength(6);
		expect(ends).toHaveLength(6);
		expect(ends.every((e) => e.evidence === 'ok')).toBe(true);
		expect(events.some((e) => e.kind === 'rotate')).toBe(false);
	});

	it('still emits dispatch.end on the failure path when the port throws', async () => {
		const tightPolicy: IOrchestratorPolicy = {
			...POLICY,
			defaults: {
				...POLICY.defaults,
				rotation: {
					maxIterationsPerSubagent: 1,
					allow: ['error-storm'],
				},
			},
		};
		const engine = createOrchestratorEngine(tightPolicy);
		const telemetry = new InMemoryTelemetrySink();
		const handlers: Handlers = {};
		const registerTool = (
			name: string,
			_def: unknown,
			fn: (args: unknown) => Promise<unknown>,
		): void => {
			handlers[name] = fn;
		};
		const port = new FakeDispatchPort({
			script: new Map([
				[
					'slot-1-scout',
					[
						{
							output: '',
							tokensUsed: 0,
							schemaOk: false,
							hadError: true,
							throw: 'rpc-down',
						},
					],
				],
			]),
		});
		await buildDispatchRegistration({
			namespacePrefix: 'ns',
			engine: () => engine,
			port: () => port,
			telemetry,
		}).register({ registerTool } as never);
		await buildReadOnlyToolRegistration({
			namespacePrefix: 'ns',
			classifier: new TaskClassifier(),
			telemetry,
			policyDefaultMode: () => tightPolicy.defaultMode,
		}).register({ registerTool } as never);

		const outcome = structured(
			await handlers.ns_dispatch!({
				task: { id: 'task-fails', description: 'boom', tags: [] },
			}),
		);
		expect(outcome?.ok).toBe(false);

		const events = await readEvents(handlers);
		const ends = events.filter(
			(e) => e.kind === 'dispatch.end' && e.taskId === 'task-fails',
		);
		// The thrown error must not skip the end event: exactly one
		// start/end pair for the single (maxIterationsPerSubagent: 1)
		// attempt, marked failed rather than silently dropped.
		expect(ends).toHaveLength(1);
		expect(ends[0]?.evidence).toBe('failed');
		expect(
			events.filter(
				(e) => e.kind === 'dispatch.start' && e.taskId === 'task-fails',
			),
		).toHaveLength(1);
	});

	it('emits a rotate event when the loop detector actually triggers a rotation', async () => {
		const port = new FakeDispatchPort({
			script: new Map([
				[
					'slot-1-scout',
					[
						badOutput('x'),
						badOutput('y'),
						badOutput('x'),
						badOutput('z'),
					],
				],
			]),
		});
		const { handlers } = await buildSharedHandlers(port);

		await handlers.ns_dispatch!({
			task: { id: 'task-rotates', description: 'flaky', tags: [] },
		});

		const events = await readEvents(handlers);
		const rotations = events.filter(
			(e) => e.kind === 'rotate' && e.taskId === 'task-rotates',
		);
		expect(rotations).toHaveLength(1);
		expect(rotations[0]?.evidence).toMatch(/repeated-output/);
	});
});
