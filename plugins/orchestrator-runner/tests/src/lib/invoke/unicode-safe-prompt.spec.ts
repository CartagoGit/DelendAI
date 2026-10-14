/**
 * unicode-safe-prompt.spec.ts — x00207 S2.
 *
 * The whale emoji (U+1F433) must leave delendai as the named ASCII
 * token `[emoji:whale U+1F433]` on every hop: manager, cli argv, mcp
 * tools/call, api JSON body, formatHandoff. Never a raw surrogate pair.
 */
import { describe, expect, it } from 'vitest';

import type {
	IProviderAvailability,
	IProviderCapabilities,
	IRoutingDecision,
	ProviderKind,
} from '@delendai/core/public';

import { InvocationManager } from '../../../../src/lib/invoke/manager';
import { formatHandoff } from '../../../../src/lib/invoke/handoff';
import type {
	IActiveInvocation,
	IInvokeRequest,
	IKindInvoker,
} from '../../../../src/lib/invoke/types';
import { buildCliArgs } from '../../../../src/lib/subprocess/cli';
import {
	createMcpInvoker,
	type IJsonRpcMessage,
	type IJsonRpcTransport,
} from '../../../../src/lib/subprocess/mcp-client';
import { createApiInvoker } from '../../../../src/lib/subprocess/api';

const WHALE = String.fromCodePoint(0x1f433);
const TASK = `use the whale ${WHALE} in the README`;

const cliProvider = (id: string): IProviderCapabilities => ({
	id,
	kind: 'cli',
	invoke: { kind: 'cli', command: id, args: [] },
	modelId: `${id}-model`,
	contextWindow: 100_000,
	costTier: 2,
	strengths: ['code-edit'],
	weaknesses: [],
});

const available = (id: string): IProviderAvailability => ({
	id,
	state: 'available',
});

const assertNamedWhale = (text: string): void => {
	expect(text).toContain('[emoji:whale U+1F433]');
	expect(text).toContain('[unicode-tokens]');
	expect(text).not.toContain(WHALE);
	expect(JSON.stringify(text)).not.toMatch(/\\uD[89A-Fa-f][0-9A-Fa-f]{2}/);
};

const recordingPromptInvoker = (sink: string[]): IKindInvoker => ({
	start: (req: IInvokeRequest): IActiveInvocation => {
		sink.push(req.prompt);
		return {
			promise: Promise.resolve({ text: 'ok' }),
			cancel: () => undefined,
		};
	},
});

const failingInvoker: IKindInvoker = {
	start: (): IActiveInvocation => ({
		promise: Promise.reject(new Error('should not run')),
		cancel: () => undefined,
	}),
};

const stubDecision = (
	invoke: IRoutingDecision['invoke'],
	prompt: string,
): IRoutingDecision => ({
	strategy: 'cli',
	targetProvider: {
		id: 'stub',
		kind: invoke.kind,
		invoke,
		modelId: 'stub-model',
		contextWindow: 100_000,
		costTier: 2,
		strengths: ['code-edit'],
		weaknesses: [],
	},
	mode: 'implement',
	prompt,
	invoke,
	rationale: 'test',
	estimatedCostTier: 2,
	alternates: [],
	scoringTrace: [],
	sessionId: 'sess_test',
});

describe('x00207 named Unicode tokens on every invoke hop', () => {
	it('InvocationManager rewrites args.task once before the fallback chain', async () => {
		const prompts: string[] = [];
		const invokers: Record<ProviderKind, IKindInvoker> = {
			cli: recordingPromptInvoker(prompts),
			api: failingInvoker,
			'mcp-server': failingInvoker,
			subscription: failingInvoker,
		};
		const manager = new InvocationManager({
			providers: [cliProvider('local-cli')],
			availabilityOf: available,
			invokers,
			defaultCostPreference: 'balanced',
			invokeTimeoutMs: 1000,
			maxFallbackDepth: 3,
			fallbackStrategy: 'rerank',
			executeApi: true,
			confirmBeforeExecute: false,
			autoBypassConfirmed: true,
		});
		const out = await manager.invoke({ task: TASK });
		expect(out.error).toBeUndefined();
		expect(prompts).toHaveLength(1);
		const prompt = prompts[0] ?? '';
		assertNamedWhale(prompt);
		expect(out.decision.prompt).toBe(prompt);
	});

	it('cli argv carries the named-token form', () => {
		const argv = buildCliArgs(['-p'], TASK);
		expect(argv).toHaveLength(2);
		assertNamedWhale(argv[1] ?? '');
	});

	it('mcp-server tools/call params carry the named-token form', async () => {
		let sent: IJsonRpcMessage | undefined;
		const transport: IJsonRpcTransport = {
			send: (message) => {
				sent = message;
				const listener = onMessage;
				if (listener !== undefined) {
					listener({
						jsonrpc: '2.0',
						id: message.id ?? 0,
						result: { content: [{ type: 'text', text: 'ok' }] },
					});
				}
			},
			onMessage: (listener) => {
				onMessage = listener;
			},
			close: () => undefined,
		};
		let onMessage: ((message: IJsonRpcMessage) => void) | undefined;
		const invoker = createMcpInvoker({
			transportFactory: () => transport,
		});
		const handle = invoker.start({
			invocationId: 'inv_1',
			decision: stubDecision(
				{ kind: 'mcp-server', server: 'codex', tool: 'ask', args: {} },
				TASK,
			),
			invoke: {
				kind: 'mcp-server',
				server: 'codex',
				tool: 'ask',
				args: {},
			},
			prompt: TASK,
		});
		await handle.promise;
		const params = sent?.params as
			| { arguments?: { prompt?: string } }
			| undefined;
		assertNamedWhale(params?.arguments?.prompt ?? '');
	});

	it('api JSON body carries the named-token form', async () => {
		let body = '';
		const invoker = createApiInvoker({
			fetchFn: async (_url, init) => {
				body = init.body ?? '';
				return {
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => 'ok',
				};
			},
			readEnv: () => 'test-key',
		});
		const handle = invoker.start({
			invocationId: 'inv_1',
			decision: stubDecision(
				{
					kind: 'api',
					url: 'https://example.test/v1',
					envVar: 'TEST_KEY',
					method: 'POST',
				},
				TASK,
			),
			invoke: {
				kind: 'api',
				url: 'https://example.test/v1',
				envVar: 'TEST_KEY',
				method: 'POST',
			},
			prompt: TASK,
		});
		await handle.promise;
		const parsed = JSON.parse(body) as { prompt?: string };
		assertNamedWhale(parsed.prompt ?? '');
		expect(body).not.toMatch(/\\uD[89A-Fa-f][0-9A-Fa-f]{2}/);
	});

	it('formatHandoff serializes the whale as ASCII [emoji:whale U+1F433] with the legend', () => {
		const cli = formatHandoff(
			stubDecision({ kind: 'cli', command: 'agent', args: [] }, TASK),
		);
		assertNamedWhale(cli.command);
		const api = formatHandoff(
			stubDecision(
				{
					kind: 'api',
					url: 'https://example.test/v1',
					envVar: 'TEST_KEY',
					method: 'POST',
				},
				TASK,
			),
		);
		assertNamedWhale(api.command);
		const mcp = formatHandoff(
			stubDecision(
				{ kind: 'mcp-server', server: 'codex', tool: 'ask', args: {} },
				TASK,
			),
		);
		assertNamedWhale(mcp.command);
	});
});
