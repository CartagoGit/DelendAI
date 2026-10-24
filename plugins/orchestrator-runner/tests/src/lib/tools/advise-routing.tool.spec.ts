/**
 * advise-routing.tool.spec.ts — v00130 (AUD-B01) regression pin.
 *
 * `advise_routing` used to declare its full, exported
 * `AdviseRoutingOutputSchema` as the wire `outputSchema` (~7.97 KB in the
 * `vertex` preset). It now declares `compactOutputSchema()` instead.
 * `AdviseRoutingOutputSchema` is not used as a runtime response validator
 * anywhere in `advise-routing.tool.ts` (verified by inspection — no
 * `.parse()`/`.safeParse()` of it against the handler's return value), so
 * there is no separate internal schema to preserve; it stays exported from
 * `schemas.ts` purely for callers/consumers, unrelated to this test. This
 * fails the day the declared schema regrows.
 */
import { describe, expect, it } from 'vitest';

import { createFakeToolServer, fakePartial } from '@delendai/test-kit/public';

import { buildAdviseRoutingRegistration } from '../../../../src/lib/tools/advise-routing.tool';
import type { SessionStore } from '../../../../src/lib/router/session';
import type { HealthStore } from '../../../../src/lib/healthcheck/store';
import type { CapabilityTag } from '@delendai/core/public';

interface IHandlerResult {
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
	readonly content?: ReadonlyArray<{ type: string; text?: string }>;
}

type ToolHandler = (args: {
	taskDescription: string;
	detail?: 'compact' | 'normal' | 'full';
	sessionId?: string;
}) => Promise<IHandlerResult>;

const jsonSchemaBytesOf = (schema: unknown): number => {
	const candidate = schema as { toJSONSchema?: () => unknown };
	const json =
		typeof candidate?.toJSONSchema === 'function'
			? candidate.toJSONSchema()
			: schema;
	return Buffer.byteLength(JSON.stringify(json), 'utf8');
};

const provider = (
	id: string,
	costTier: 1 | 2 | 3 | 4 | 5,
	strengths: readonly CapabilityTag[],
) => ({
	id,
	kind: 'cli' as const,
	invoke: { kind: 'cli' as const, command: `run-${id}` },
	modelId: `${id}-model`,
	contextWindow: 128_000,
	costTier,
	strengths,
	weaknesses: [],
});

const capture = async (): Promise<{
	readonly outputSchema: unknown;
	readonly handler: ToolHandler;
}> => {
	let outputSchema: unknown;
	let handler: ToolHandler | undefined;
	const server = createFakeToolServer({
		onRegisterTool: (call) => {
			outputSchema = (call.config as { outputSchema?: unknown })
				.outputSchema;
			handler = call.handler as ToolHandler;
		},
	});
	const registration = buildAdviseRoutingRegistration({
		namespacePrefix: 'mcp',
		providers: [
			provider('fast', 1, ['fast-iteration'] as const),
			provider('steady', 2, ['fast-iteration'] as const),
			provider('deep', 4, ['reasoning'] as const),
		],
		health: fakePartial<HealthStore>({
			get: (id: string) => ({ id, state: 'available' }),
		}),
		sessions: fakePartial<SessionStore>({
			get: () => undefined,
			set: () => {},
		}),
		defaultCostPreference: 'balanced',
		loopDetector: {
			isAgentStuck: () => ({
				handoffPath: 'format_handoff',
				suggestedAction: 'handoff now',
			}),
		},
	});
	await registration.register(server);
	if (handler === undefined) throw new Error('handler was not registered');
	return { outputSchema, handler };
};

describe('advise_routing tool', () => {
	it('declares a compact outputSchema, not the full AdviseRoutingOutputSchema shape', async () => {
		const { outputSchema } = await capture();
		expect(outputSchema).toBeDefined();
		expect(jsonSchemaBytesOf(outputSchema)).toBeLessThanOrEqual(200);
	});

	it('defaults to compact detail and omits alternates plus scoringTrace from the decision', async () => {
		const { handler } = await capture();
		const result = await handler({
			taskDescription: 'Implement coding task',
			sessionId: 'sess-1',
		});
		expect(result.structuredContent?.level).toBe('compact');
		const decision = result.structuredContent?.decision as Record<
			string,
			unknown
		>;
		expect(decision.targetProvider).toEqual({
			id: 'steady',
			kind: 'cli',
			modelId: 'steady-model',
			costTier: 2,
			contextWindow: 128000,
		});
		expect(decision).not.toHaveProperty('alternates');
		expect(decision).not.toHaveProperty('scoringTrace');
		expect(result.structuredContent?.loopWarning).toEqual({
			handoffPath: 'format_handoff',
			suggestedAction: 'handoff now',
		});
	});

	it('normal detail adds alternate summaries and the scoring trace', async () => {
		const { handler } = await capture();
		const result = await handler({
			taskDescription: 'Implement coding task',
			detail: 'normal',
			sessionId: 'sess-2',
		});
		expect(result.structuredContent?.level).toBe('normal');
		const decision = result.structuredContent?.decision as Record<
			string,
			unknown
		>;
		expect(decision).toHaveProperty('alternates');
		expect(decision).toHaveProperty('scoringTrace');
		const alternates = decision.alternates as Array<
			Record<string, unknown>
		>;
		expect(alternates[0]?.targetProvider).toEqual({
			id: 'fast',
			kind: 'cli',
			modelId: 'fast-model',
			costTier: 1,
			contextWindow: 128000,
		});
		expect(alternates[0]).not.toHaveProperty('invoke');
	});

	it('full detail restores the legacy full decision payload', async () => {
		const { handler } = await capture();
		const result = await handler({
			taskDescription: 'Implement coding task',
			detail: 'full',
			sessionId: 'sess-3',
		});
		expect(result.structuredContent?.level).toBe('full');
		const decision = result.structuredContent?.decision as Record<
			string,
			unknown
		>;
		const providerView = decision.targetProvider as Record<string, unknown>;
		expect(providerView.strengths).toEqual(['fast-iteration']);
		expect(providerView.weaknesses).toEqual([]);
		const alternates = decision.alternates as Array<
			Record<string, unknown>
		>;
		expect(alternates[0]?.invoke).toEqual({
			kind: 'cli',
			command: 'run-fast',
		});
		expect(decision).toHaveProperty('scoringTrace');
	});
});
