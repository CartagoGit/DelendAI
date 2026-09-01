/**
 * llm-rationale.spec.ts — f00142 S3 acceptance: the opt-in LLM
 * rationale builder degrades gracefully when no provider is
 * reachable and surfaces the cheapest-capable provider when one is.
 */
import { describe, expect, it } from 'vitest';

import { buildLlmRationale } from '@mcp-vertex/auto-plugin-selector/lib/refine/llm-rationale';
import type { IProviderCandidate } from '@mcp-vertex/auto-agent-selector/public';
import type {
	IPluginFit,
	IProjectSignals,
} from '@mcp-vertex/auto-plugin-selector/lib/contracts/interfaces/plugin-fit.interface';

const cand = (
	over: Partial<IProviderCandidate> & { id: string },
): IProviderCandidate => ({
	id: over.id,
	label: over.label ?? over.id,
	source: over.source ?? 'cli',
	vendor: over.vendor ?? 'open',
	reach: over.reach ?? over.id,
	costTier: over.costTier ?? 1,
});

const pluginFit = (id: string, score: number): IPluginFit => ({
	plugin: { id, tags: [], summary: `${id} plugin` },
	fitScore: score,
	reasons: ['pack:typescript'],
	unmatchedTags: [],
});

const SIGNALS: IProjectSignals = {
	pack: 'typescript',
	languages: ['typescript'],
};

describe('buildLlmRationale', () => {
	it('returns reachable=false when the roster is empty', () => {
		const decision = buildLlmRationale(SIGNALS, [pluginFit('a', 1)], []);
		expect(decision.reachable).toBe(false);
		expect(decision.providerId).toBeUndefined();
		expect(decision.prompt).toBeUndefined();
	});

	it('picks the cheapest-capable provider when the dial leans cheaper (8/10)', () => {
		const decision = buildLlmRationale(
			SIGNALS,
			[pluginFit('a', 1)],
			[
				cand({ id: 'expensive', vendor: 'a', costTier: 5 }),
				cand({ id: 'cheap', vendor: 'b', costTier: 1 }),
			],
			{ costQualityTradeoff: 8 },
		);
		expect(decision.reachable).toBe(true);
		expect(decision.providerId).toBe('cheap');
		expect(decision.costTier).toBe(1);
		expect(decision.vendor).toBe('b');
		expect(decision.rationale).toBeDefined();
	});

	it('honors a pinned provider when reachable', () => {
		const decision = buildLlmRationale(
			SIGNALS,
			[pluginFit('a', 1)],
			[
				cand({ id: 'cheap', vendor: 'a', costTier: 1 }),
				cand({ id: 'pinned', vendor: 'b', costTier: 5 }),
			],
			{ pinnedId: 'pinned' },
		);
		expect(decision.providerId).toBe('pinned');
		expect(decision.costTier).toBe(5);
	});

	it('falls back to the cheapest when the pinned id is not in the roster', () => {
		const decision = buildLlmRationale(
			SIGNALS,
			[pluginFit('a', 1)],
			[cand({ id: 'cheap', costTier: 1 })],
			{ pinnedId: 'missing' },
		);
		expect(decision.providerId).toBe('cheap');
	});

	it('produces a deterministic prompt for the same input', () => {
		const a = buildLlmRationale(
			SIGNALS,
			[pluginFit('a', 1), pluginFit('b', 0.5)],
			[cand({ id: 'p', costTier: 2 })],
		);
		const b = buildLlmRationale(
			SIGNALS,
			[pluginFit('a', 1), pluginFit('b', 0.5)],
			[cand({ id: 'p', costTier: 2 })],
		);
		expect(a.prompt).toBe(b.prompt);
		expect(a.prompt).toContain('pack: typescript');
		expect(a.prompt).toContain('a (score=1.00)');
		expect(a.prompt).toContain('b (score=0.50)');
	});

	it('handles an empty fit list (no positive-fit plugins)', () => {
		const decision = buildLlmRationale(SIGNALS, [], [cand({ id: 'p' })]);
		expect(decision.reachable).toBe(true);
		expect(decision.prompt).toContain('no positive-fit plugins');
	});

	it('is pure (same input -> same decision object reference-equal content)', () => {
		const a = buildLlmRationale(
			SIGNALS,
			[pluginFit('a', 1)],
			[cand({ id: 'p' })],
		);
		const b = buildLlmRationale(
			SIGNALS,
			[pluginFit('a', 1)],
			[cand({ id: 'p' })],
		);
		expect(a.providerId).toBe(b.providerId);
		expect(a.costTier).toBe(b.costTier);
		expect(a.prompt).toBe(b.prompt);
	});
});
