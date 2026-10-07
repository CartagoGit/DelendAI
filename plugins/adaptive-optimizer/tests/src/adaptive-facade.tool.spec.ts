import { describe, expect, it } from 'vitest';

import { PROPOSALS_STABLE_TOOL_SURFACE } from '@delendai/proposals/public';

import { DEFAULT_ADAPTIVE_OPTIMIZER_MAX_BYTES } from '../../src/lib/contracts/constants/adaptive-optimizer.constant';
import {
	AdaptiveFacadeOutputSchema,
	runAdaptiveFacade,
} from '../../src/public/index';

const defaultFacadeOptions = {
	namespacePrefix: 'delendai',
	maxBytes: DEFAULT_ADAPTIVE_OPTIMIZER_MAX_BYTES,
} as const;

describe('adaptive_facade', () => {
	it.each([
		['orient', ['auto_work']],
		['plan', ['auto_work']],
		['claim', ['agent_lock', 'agent_worktree']],
		['progress', ['proposal_review', 'task_queue_enqueue']],
		['close', ['proposal_transition', 'proposal_review']],
		['recover', ['state_repair', 'proposal_force_transition']],
	] as const)(
		'maps %s to existing proposal capabilities',
		async (intent, expectedTools) => {
			const result = await runAdaptiveFacade(
				{ intent },
				defaultFacadeOptions,
			);
			const output = AdaptiveFacadeOutputSchema.parse(
				result.structuredContent,
			);
			const routedTools = [
				output.preferredPath.toolName,
				...output.alternatives.map((candidate) => candidate.toolName),
			];
			expect(routedTools).toEqual(
				expect.arrayContaining([...expectedTools]),
			);
			expect(output.preferredPath.intent).toBe(intent);
		},
	);

	it('uses observed success, tokens, calls, latency and risk to pick a preferred close path', async () => {
		const result = await runAdaptiveFacade(
			{
				intent: 'close',
				history: [
					{
						tool: 'proposal_transition',
						outcome: 'error',
						totalTokens: 520,
						durationMs: 310,
					},
					{
						tool: 'proposal_transition',
						outcome: 'timeout',
						totalTokens: 610,
						durationMs: 420,
					},
					{
						tool: 'proposal_review',
						outcome: 'success',
						totalTokens: 110,
						durationMs: 70,
					},
					{
						tool: 'proposal_review',
						outcome: 'success',
						totalTokens: 120,
						durationMs: 80,
					},
				],
			},
			defaultFacadeOptions,
		);
		const output = AdaptiveFacadeOutputSchema.parse(
			result.structuredContent,
		);
		expect(output.preferredPath.toolName).toBe('proposal_review');
		expect(output.preferredPath.metrics.usedObservedHistory).toBe(true);
		expect(output.preferredPath.metrics.successRate).toBe(1);
		expect(output.preferredPath.metrics.tokenCost).toBeLessThan(
			output.alternatives[0]!.metrics.tokenCost,
		);
		expect(output.preferredPath.metrics.latencyMs).toBeLessThan(
			output.alternatives[0]!.metrics.latencyMs,
		);
		expect(output.preferredPath.metrics.sideEffectRisk).toBeLessThan(
			output.alternatives[0]!.metrics.sideEffectRisk,
		);
	});

	it('preserves the detailed proposals surface alongside the adaptive recommendation', async () => {
		const result = await runAdaptiveFacade(
			{ intent: 'recover', maxAlternatives: 2 },
			defaultFacadeOptions,
		);
		const output = AdaptiveFacadeOutputSchema.parse(
			result.structuredContent,
		);
		expect(output.truncated).toBe(false);
		expect(output.detailedSurface).toEqual(PROPOSALS_STABLE_TOOL_SURFACE);
		expect(output.detailedSurface).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'proposal_create',
					plugin: 'proposals',
					sinceVersion: expect.any(String),
					semverGuarantee: 'additive-only',
					inputSchema: expect.anything(),
					outputSchema: expect.anything(),
				}),
				expect.objectContaining({ name: 'agent_worktree' }),
			]),
		);
	});

	it('truncates only when the caller provides an explicit byte budget', async () => {
		const result = await runAdaptiveFacade(
			{ intent: 'recover', maxAlternatives: 2, maxBytes: 700 },
			defaultFacadeOptions,
		);
		const output = AdaptiveFacadeOutputSchema.parse(
			result.structuredContent,
		);
		expect(output.truncated).toBe(true);
		expect(output.alternatives).toEqual([]);
		expect(output.detailedSurface).toEqual(
			PROPOSALS_STABLE_TOOL_SURFACE.slice(0, 4),
		);
		expect(output.detailedSurface[0]).toEqual(
			expect.objectContaining({
				inputSchema: expect.anything(),
				outputSchema: expect.anything(),
			}),
		);
	});
});
