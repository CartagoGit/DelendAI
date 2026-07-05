/**
 * manager.spec.ts — the S7 spend-guard integration of the invocation manager.
 *
 * Proves the CRITICAL invariant: on a hard block the spend-limit error fires
 * BEFORE any invoker starts (no subprocess/HTTP), a skip degrades past the
 * blocked hop, and a successful bypass stamps `autoBypassed`.
 */
import { describe, expect, it } from 'vitest';

import type {
	IProviderAvailability,
	IProviderCapabilities,
	ProviderKind,
} from '@mcp-vertex/core/public';

import { InvocationManager } from '../../../../src/lib/invoke/manager';
import type {
	IActiveInvocation,
	IKindInvoker,
} from '../../../../src/lib/invoke/types';
import type { SpendCheckOutcome } from '../../../../src/lib/invoke/spend-guard';

const provider = (
	id: string,
	costTier: 1 | 2 | 3 | 4 | 5,
): IProviderCapabilities => ({
	id,
	kind: 'cli',
	invoke: { kind: 'cli', command: id, args: [] },
	modelId: `${id}-model`,
	contextWindow: 100_000,
	costTier,
	strengths: ['code-edit'],
	weaknesses: [],
});

const available = (id: string): IProviderAvailability => ({
	id,
	state: 'available',
});

/** A cli invoker that records every start and resolves successfully. */
const recordingInvoker = (startedIds: string[]): IKindInvoker => ({
	start: (req): IActiveInvocation => {
		startedIds.push(req.decision.targetProvider.id);
		return {
			promise: Promise.resolve({
				text: `ran ${req.decision.targetProvider.id}`,
			}),
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

const makeManager = (opts: {
	providers: readonly IProviderCapabilities[];
	startedIds: string[];
	checkSpend?: (decision: {
		targetProvider: { id: string };
	}) => SpendCheckOutcome;
	fallbackStrategy?: 'rerank' | 'tier-down';
}): InvocationManager => {
	const invokers: Record<ProviderKind, IKindInvoker> = {
		cli: recordingInvoker(opts.startedIds),
		api: recordingInvoker(opts.startedIds),
		'mcp-server': failingInvoker,
		subscription: failingInvoker,
	};
	return new InvocationManager({
		providers: opts.providers,
		availabilityOf: available,
		invokers,
		defaultCostPreference: 'balanced',
		invokeTimeoutMs: 1000,
		maxFallbackDepth: 3,
		fallbackStrategy: opts.fallbackStrategy ?? 'rerank',
		executeApi: true,
		confirmBeforeExecute: false,
		autoBypassConfirmed: true,
		...(opts.checkSpend !== undefined
			? {
					checkSpend: (decision: {
						targetProvider: { id: string };
					}) => opts.checkSpend!(decision),
				}
			: {}),
	});
};

describe('InvocationManager spend guard (S7)', () => {
	it('fires spend-limit-exceeded BEFORE any invoker starts (hard block)', async () => {
		const startedIds: string[] = [];
		const manager = makeManager({
			providers: [provider('pricey', 3)],
			startedIds,
			checkSpend: () => ({
				outcome: 'block',
				error: {
					scope: 'session',
					limitUsd: 10,
					observedUsd: 12,
					message: 'over cap',
				},
			}),
		});
		const out = await manager.invoke({ task: 'do it' });
		expect(out.error?.code).toBe('spend-limit-exceeded');
		expect(out.error?.scope).toBe('session');
		expect(out.error?.limitUsd).toBe(10);
		expect(out.error?.observedUsd).toBe(12);
		expect(out.userMessage).toBe('over cap');
		// The critical invariant: nothing spawned.
		expect(startedIds).toEqual([]);
	});

	it('skips the blocked hop and degrades to the cheap provider', async () => {
		const startedIds: string[] = [];
		const manager = makeManager({
			providers: [provider('pricey', 3), provider('cheap', 1)],
			startedIds,
			checkSpend: (d) =>
				d.targetProvider.id === 'cheap'
					? { outcome: 'proceed' }
					: { outcome: 'skip', note: 'spend-degraded → cheap' },
		});
		const out = await manager.invoke({ task: 'do it' });
		expect(out.error).toBeUndefined();
		expect(out.decision.targetProvider.id).toBe('cheap');
		expect(startedIds).toEqual(['cheap']);
	});

	it('stamps autoBypassed on a successful auto-bypassed spend', async () => {
		const startedIds: string[] = [];
		const manager = makeManager({
			providers: [provider('solo', 2)],
			startedIds,
			checkSpend: () => ({ outcome: 'proceed' }),
		});
		const out = await manager.invoke({ task: 'do it' });
		expect(out.result).toBeDefined();
		expect(out.autoBypassed).toBe(true);
	});

	it('does not block spend when no checkSpend seam is wired', async () => {
		const startedIds: string[] = [];
		const manager = makeManager({
			providers: [provider('solo', 2)],
			startedIds,
		});
		const out = await manager.invoke({ task: 'do it' });
		expect(out.error).toBeUndefined();
		expect(startedIds).toEqual(['solo']);
	});
});
