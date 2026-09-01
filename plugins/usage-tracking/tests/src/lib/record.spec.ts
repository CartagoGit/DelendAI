/**
 * record.spec.ts — build a durable record from hook payloads.
 */
import { describe, expect, it } from 'vitest';

import {
	buildRecord,
	extractModel,
	extractTokenAccounting,
	extractTokensSaved,
	extractUsage,
	resolveSessionId,
} from '../../../src/lib/record';
import type { IModelDescriptor, IUsageTokens } from '../../../src/lib/types';

const noCost = (): number | null => null;

describe('extractUsage / extractModel', () => {
	it('pulls usage from structuredContent', () => {
		expect(
			extractUsage({
				structuredContent: {
					usage: { inputTokens: 10, outputTokens: 5 },
				},
			}),
		).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
	});

	it('returns null when no usage is present', () => {
		expect(extractUsage({ structuredContent: {} })).toBeNull();
		expect(extractUsage('plain text')).toBeNull();
	});

	it('pulls a model from a decision.targetProvider block', () => {
		expect(
			extractModel({
				structuredContent: {
					decision: {
						targetProvider: {
							id: 'copilot-m3',
							modelId: 'MiniMax-M3',
							kind: 'subscription',
						},
					},
				},
			}),
		).toEqual({
			provider: 'copilot-m3',
			modelId: 'MiniMax-M3',
			kind: 'subscription',
		});
	});

	it('returns null when no model info is present', () => {
		expect(extractModel({ structuredContent: {} })).toBeNull();
	});

	it('extracts savings from compaction token accounting', () => {
		expect(
			extractTokensSaved({
				structuredContent: { tokenAccounting: { tokensSaved: 375 } },
			}),
		).toBe(375);
		expect(extractTokensSaved({ structuredContent: {} })).toBe(0);
	});

	it('measures per-call savings from an explicit token baseline', () => {
		const result = {
			structuredContent: {
				usage: { inputTokens: 80, outputTokens: 20 },
				tokenAccounting: { baselineTokens: 150 },
			},
		};
		const usage = extractUsage(result);
		expect(extractTokenAccounting(result, usage, 0)).toEqual({
			baselineTokens: 150,
			usedTokens: 100,
			tokensSaved: 50,
			savingsPercent: 33,
			status: 'measured',
			basis: 'explicit baselineTokens/tokensBefore vs provider usage',
		});
	});

	it('does not invent a saving without a baseline', () => {
		expect(
			extractTokenAccounting({}, { totalTokens: 100 }, 0),
		).toMatchObject({
			baselineTokens: null,
			usedTokens: 100,
			tokensSaved: null,
			status: 'unavailable',
		});
	});
});

describe('resolveSessionId', () => {
	it('prefers an args.sessionId when present', () => {
		expect(resolveSessionId({ sessionId: 's_call' }, 's_boot')).toBe(
			's_call',
		);
	});
	it('falls back to the boot session id', () => {
		expect(resolveSessionId({}, 's_boot')).toBe('s_boot');
		expect(resolveSessionId(undefined, 's_boot')).toBe('s_boot');
	});
});

describe('buildRecord', () => {
	const base = {
		corePrefix: 'mcp-vertex',
		peerPrefixes: ['proposals', 'usage-tracking'],
		agent: {
			id: 'copilot-1',
			kind: 'copilot',
			extension: 'vscode-copilot',
		},
		sessionId: 's_boot',
		args: {},
		startedAt: 1000,
		endedAt: 1450,
		costOf: noCost,
	};

	it('records a successful call with attribution + duration', () => {
		const record = buildRecord({
			...base,
			toolName: 'mcp-vertex_proposals_auto_work',
			result: { ok: true },
			responseBytes: 123,
		});
		expect(record.plugin).toBe('proposals');
		expect(record.tool).toBe('auto_work');
		expect(record.outcome).toBe('success');
		expect(record.durationMs).toBe(450);
		expect(record.error).toBeNull();
		expect(record.agent.kind).toBe('copilot');
		expect(record.responseBytes).toBe(123);
	});

	it('records an error outcome from a thrown error', () => {
		const record = buildRecord({
			...base,
			toolName: 'mcp-vertex_proposals_auto_work',
			result: undefined,
			error: new Error('boom'),
		});
		expect(record.outcome).toBe('error');
		expect(record.error?.message).toBe('boom');
	});

	it('records an error outcome from an isError result envelope', () => {
		const record = buildRecord({
			...base,
			toolName: 'mcp-vertex_proposals_auto_work',
			result: {
				isError: true,
				structuredContent: { error: { code: 'e1', message: 'nope' } },
			},
		});
		expect(record.outcome).toBe('error');
		expect(record.error?.code).toBe('e1');
	});

	it('leaves durationMs null when no start was observed', () => {
		const record = buildRecord({
			...base,
			startedAt: undefined,
			toolName: 'mcp-vertex_overview',
			result: { ok: true },
		});
		expect(record.durationMs).toBeNull();
		expect(record.plugin).toBe('core');
	});

	it('applies the injected cost function to model + usage', () => {
		const costOf = (
			model: IModelDescriptor | null,
			usage: IUsageTokens | null,
		): number | null => (model && usage ? 0.42 : null);
		const record = buildRecord({
			...base,
			costOf,
			toolName: 'mcp-vertex_orchestrator-runner_invoke',
			peerPrefixes: ['orchestrator-runner'],
			result: {
				structuredContent: {
					usage: { inputTokens: 10, outputTokens: 10 },
					model: { provider: 'p', modelId: 'm', kind: 'api' },
				},
			},
		});
		expect(record.costUsd).toBe(0.42);
		expect(record.model?.provider).toBe('p');
	});

	it('attributes a saving-only call to the last model in its session', () => {
		const fallbackModel: IModelDescriptor = {
			provider: 'openai',
			modelId: 'gpt-5-codex',
			kind: 'api',
		};
		const record = buildRecord({
			...base,
			toolName: 'mcp-vertex_memory_compact',
			result: { tokenAccounting: { tokensSaved: 240 } },
			fallbackModel,
		});
		expect(record.tokensSaved).toBe(240);
		expect(record.model).toEqual(fallbackModel);
	});

	it('uses a configured plugin/tool baseline when the result has none', () => {
		const record = buildRecord({
			...base,
			toolName: 'mcp-vertex_orchestrator-runner_invoke',
			peerPrefixes: ['orchestrator-runner'],
			result: {
				structuredContent: {
					usage: { totalTokens: 100 },
					model: { provider: 'p', modelId: 'm', kind: 'api' },
				},
			},
			baselineTokensOf: (plugin, tool) =>
				plugin === 'orchestrator-runner' && tool === 'invoke'
					? 140
					: undefined,
		});
		expect(record.tokenAccounting).toMatchObject({
			baselineTokens: 140,
			usedTokens: 100,
			tokensSaved: 40,
			status: 'measured',
		});
		expect(record.tokensSaved).toBe(40);
	});

	it('does not attribute ordinary plugin calls to the last model', () => {
		const record = buildRecord({
			...base,
			toolName: 'mcp-vertex_docs_docs_list',
			result: { ok: true },
			fallbackModel: {
				provider: 'openai',
				modelId: 'gpt-5-codex',
				kind: 'api',
			},
		});
		expect(record.tokensSaved).toBe(0);
		expect(record.model).toBeNull();
	});
});
