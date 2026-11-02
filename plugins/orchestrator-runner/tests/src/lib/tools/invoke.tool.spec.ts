/**
 * invoke.tool.spec.ts — v00130 (AUD-B01) regression pin.
 *
 * `invoke` used to declare its full, exported `InvokeOutputSchema` as the
 * wire `outputSchema` (~9.1 KB in the `vertex` preset). It now declares
 * `compactOutputSchema()` instead. `InvokeOutputSchema` is not used as a
 * runtime response validator anywhere in `invoke.tool.ts` (verified by
 * inspection — no `.parse()`/`.safeParse()` of it against the handler's
 * return value), so there is no separate internal schema to preserve; it
 * stays exported from `schemas.ts` purely for callers/consumers, unrelated
 * to this test. This fails the day the declared schema regrows.
 */
import { describe, expect, it } from 'vitest';

import {
	createInMemoryHandleStore,
	type IHandleStore,
} from '@delendai/core/public';
import { createFakeToolServer, fakePartial } from '@delendai/test-kit/public';

import { buildInvokeRegistration } from '../../../../src/lib/tools/invoke.tool';
import type {
	IInvokeOutput,
	InvocationManager,
} from '../../../../src/lib/invoke/manager';

interface IHandlerResult {
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
	readonly content?: ReadonlyArray<{ type: string; text?: string }>;
}

type ToolHandler = (args: {
	task: string;
	detail?: 'compact' | 'normal' | 'full';
	maxBytes?: number;
}) => Promise<IHandlerResult>;

const jsonSchemaBytesOf = (schema: unknown): number => {
	const candidate = schema as { toJSONSchema?: () => unknown };
	const json =
		typeof candidate?.toJSONSchema === 'function'
			? candidate.toJSONSchema()
			: schema;
	return Buffer.byteLength(JSON.stringify(json), 'utf8');
};

const outputFixture = (): IInvokeOutput => ({
	decision: {
		strategy: 'cli',
		targetProvider: {
			id: 'steady',
			kind: 'cli',
			invoke: { kind: 'cli', command: 'run-steady' },
			modelId: 'steady-model',
			contextWindow: 128_000,
			costTier: 2,
			strengths: ['fast-iteration'],
			weaknesses: [],
		},
		mode: 'implement',
		prompt: 'Do the task',
		invoke: { kind: 'cli', command: 'run-steady' },
		rationale: 'best fit',
		estimatedCostTier: 2,
		alternates: [
			{
				strategy: 'cli',
				targetProvider: {
					id: 'fast',
					kind: 'cli',
					invoke: { kind: 'cli', command: 'run-fast' },
					modelId: 'fast-model',
					contextWindow: 128_000,
					costTier: 1,
					strengths: ['fast-iteration'],
					weaknesses: [],
				},
				mode: 'implement',
				prompt: 'Do the task',
				invoke: { kind: 'cli', command: 'run-fast' },
				rationale: 'backup',
				estimatedCostTier: 1,
				alternates: [],
				scoringTrace: [],
				sessionId: 'sess-1',
			},
		],
		scoringTrace: [{ provider: 'steady', score: 3, reasons: ['best'] }],
		sessionId: 'sess-1',
	},
	invocationId: 'inv-1',
	result: {
		text: 'ran steady',
		structuredContent: { ok: true, nested: { value: 1 } },
		usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
		costUsd: 0.12,
	},
	userMessage: 'done',
});

const capture = async (
	options: {
		readonly resultHandleStore?: IHandleStore<
			NonNullable<IInvokeOutput['result']>
		>;
		readonly resultHandleTtlMs?: number;
		readonly resultHandleMaxBytes?: number;
	} = {},
): Promise<{
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
	const registration = buildInvokeRegistration({
		namespacePrefix: 'mcp',
		manager: fakePartial<InvocationManager>({
			invoke: async () => outputFixture(),
		}),
		...options,
	});
	await registration.register(server);
	if (handler === undefined) throw new Error('handler was not registered');
	return { outputSchema, handler };
};

describe('invoke tool', () => {
	it('declares a compact outputSchema, not the full InvokeOutputSchema shape', async () => {
		const { outputSchema } = await capture();
		expect(outputSchema).toBeDefined();
		expect(jsonSchemaBytesOf(outputSchema)).toBeLessThanOrEqual(200);
	});

	it('defaults to compact detail and keeps the execution result untouched', async () => {
		const { handler } = await capture();
		const result = await handler({ task: 'Do the task' });
		expect(result.structuredContent?.level).toBe('compact');
		const decision = result.structuredContent?.decision as Record<
			string,
			unknown
		>;
		expect(decision).not.toHaveProperty('alternates');
		expect(decision).not.toHaveProperty('scoringTrace');
		expect(result.structuredContent?.result).toEqual({
			text: 'ran steady',
			structuredContent: { ok: true, nested: { value: 1 } },
			usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
			costUsd: 0.12,
		});
	});

	it('normal detail adds alternate summaries and the scoring trace', async () => {
		const { handler } = await capture();
		const result = await handler({
			task: 'Do the task',
			detail: 'normal',
		});
		expect(result.structuredContent?.level).toBe('normal');
		const decision = result.structuredContent?.decision as Record<
			string,
			unknown
		>;
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
		expect(decision.scoringTrace).toEqual([
			{ provider: 'steady', score: 3, reasons: ['best'] },
		]);
	});

	it('full detail restores the legacy full decision payload', async () => {
		const { handler } = await capture();
		const result = await handler({
			task: 'Do the task',
			detail: 'full',
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
	});

	it('returns a bounded resultArtifact handle when maxBytes truncates the execution result', async () => {
		const store =
			createInMemoryHandleStore<NonNullable<IInvokeOutput['result']>>();
		const { handler } = await capture({
			resultHandleStore: store,
			resultHandleTtlMs: 1_000,
		});
		const result = await handler({ task: 'Do the task', maxBytes: 64 });
		expect(result.structuredContent?.level).toBe('compact');
		expect(result.structuredContent?.result).toBeNull();
		expect(result.structuredContent?.resultProjection).toEqual({
			maxBytes: 64,
			emittedBytes: 0,
			truncated: true,
			truncatedByBytes: true,
			truncatedByLimit: false,
		});
		const artifact = result.structuredContent?.resultArtifact as
			| {
					readonly handleId: string;
					readonly viewerToken: string;
			  }
			| undefined;
		expect(artifact).toBeDefined();
		const read = store.get(
			artifact?.handleId ?? '',
			artifact?.viewerToken ?? '',
		);
		expect(read.status).toBe('ok');
		if (read.status === 'ok') {
			expect(read.value).toEqual(outputFixture().result);
		}
	});
});
