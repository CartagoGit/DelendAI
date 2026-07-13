import { describe, expect, it } from 'vitest';

import type {
	IProviderAvailability,
	IProviderCapabilities,
} from '@mcp-vertex/core/public';

import type { IRoutingHint } from '../../../../src/lib/types';
import {
	buildRoutingDecision,
	strategyForKind,
} from '../../../../src/lib/router/advise';

const provider = (
	over: Partial<IProviderCapabilities> = {},
): IProviderCapabilities => ({
	id: over.id ?? 'p',
	kind: 'cli',
	invoke: { kind: 'cli', command: 'claude', args: [] },
	modelId: 'm',
	contextWindow: 200_000,
	costTier: 3,
	strengths: [],
	weaknesses: [],
	...over,
});

const hint: IRoutingHint = {
	mode: 'implement',
	capabilities: ['code-edit'],
	costPref: 'balanced',
};

const allAvailable = (): IProviderAvailability => ({
	id: 'x',
	state: 'available',
});

describe('strategyForKind (CRITICAL C4)', () => {
	it('maps each provider kind to a routing strategy', () => {
		expect(strategyForKind('api')).toBe('api');
		expect(strategyForKind('cli')).toBe('cli');
		expect(strategyForKind('mcp-server')).toBe('mcp-tool');
		expect(strategyForKind('subscription')).toBe('passthrough');
	});
});

describe('buildRoutingDecision', () => {
	it('hands off when the roster is empty', () => {
		const d = buildRoutingDecision({
			providers: [],
			availabilityOf: allAvailable,
			hint,
			prompt: 'do a thing',
			sessionId: 's1',
		});
		expect(d.strategy).toBe('handoff');
		expect(d.rationale).toMatch(/bootstrap/i);
		expect(d.scoringTrace).toHaveLength(0);
		expect(d.sessionId).toBe('s1');
	});

	it('hands off when every provider is unavailable', () => {
		const d = buildRoutingDecision({
			providers: [provider({ id: 'a', strengths: ['code-edit'] })],
			availabilityOf: () => ({ id: 'a', state: 'quota-exceeded' }),
			hint,
			prompt: 'x',
			sessionId: 's2',
		});
		expect(d.strategy).toBe('handoff');
		expect(d.rationale).toMatch(/unavailable/i);
		// The unavailable provider still appears in the transparency trace.
		expect(d.scoringTrace).toHaveLength(1);
		expect(d.scoringTrace[0]?.score).toBeLessThanOrEqual(-10);
	});

	it('picks the highest-scoring available provider and lists top-2 backups', () => {
		const providers = [
			provider({ id: 'weak', strengths: [], weaknesses: ['code-edit'] }),
			provider({
				id: 'best',
				kind: 'api',
				invoke: { kind: 'api', url: 'https://x', envVar: 'K' },
				strengths: ['code-edit'],
			}),
			provider({
				id: 'mid',
				strengths: ['code-edit'],
				weaknesses: ['vision'],
			}),
		];
		const d = buildRoutingDecision({
			providers,
			availabilityOf: (id) => ({ id, state: 'available' }),
			hint,
			prompt: 'edit code',
			sessionId: 's3',
		});
		expect(d.targetProvider.id).toBe('best');
		expect(d.strategy).toBe('api');
		expect(d.estimatedCostTier).toBe(3);
		// Backups: the next-best, at most 2, and each excludes the winner.
		expect(d.alternates.length).toBeGreaterThan(0);
		expect(d.alternates.length).toBeLessThanOrEqual(2);
		expect(d.alternates.every((a) => a.targetProvider.id !== 'best')).toBe(
			true,
		);
		// Backups are self-contained (no nested trace/alternates).
		for (const alt of d.alternates) {
			expect(alt.alternates).toHaveLength(0);
			expect(alt.scoringTrace).toHaveLength(0);
		}
	});

	it('excludes unavailable providers from the backup list', () => {
		const providers = [
			provider({ id: 'win', strengths: ['code-edit'] }),
			provider({ id: 'down' }),
		];
		const d = buildRoutingDecision({
			providers,
			availabilityOf: (id) =>
				id === 'down'
					? { id, state: 'error' }
					: { id, state: 'available' },
			hint,
			prompt: 'x',
			sessionId: 's4',
		});
		expect(d.targetProvider.id).toBe('win');
		expect(d.alternates.every((a) => a.targetProvider.id !== 'down')).toBe(
			true,
		);
	});
});
