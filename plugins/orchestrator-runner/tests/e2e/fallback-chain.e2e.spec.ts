/**
 * fallback-chain.e2e.spec.ts — f00067 S10 end-to-end fallback smoke.
 *
 * Acceptance: "mark the top-scored provider `quota-exceeded`, verify the
 * runner picks next-best; advance the clock past `resetAt`, verify it
 * retries the original."
 *
 * Pure, in-process, deterministic. Drives the REAL invocation brain
 * ({@link InvocationManager}) which plans against the REAL fallback planner
 * ({@link planFallbackChain}) and the REAL scorer (`explainScore`). Time is
 * an injected clock — no real timers, no sleep, no subprocess, no network.
 * `subscription` providers are used so the spend-guard/auth path never gates
 * the run: the test isolates the fallback + clock-reset behaviour only.
 */
import { describe, expect, it } from 'vitest';

import type {
	IProviderAvailability,
	IProviderCapabilities,
	ProviderKind,
} from '@delendai/core/public';

import { InvocationManager } from '../../src/lib/invoke/manager';
import { planFallbackChain } from '../../src/lib/invoke/fallback';
import type {
	IActiveInvocation,
	IKindInvoker,
} from '../../src/lib/invoke/types';

/** A `subscription` provider (passthrough — never a spend kind). */
const provider = (
	id: string,
	costTier: 1 | 2 | 3 | 4 | 5,
): IProviderCapabilities => ({
	id,
	kind: 'subscription',
	invoke: { kind: 'subscription', tool: 'claude-code' },
	modelId: `${id}-model`,
	contextWindow: 200_000,
	costTier,
	strengths: ['code-edit'],
	weaknesses: [],
});

/** A deterministic, injectable clock (ms epoch → Date). */
const makeClock = (startMs: number) => {
	let nowMs = startMs;
	return {
		now: (): Date => new Date(nowMs),
		advanceMs: (ms: number): void => {
			nowMs += ms;
		},
	};
};

/** An invoker that records which provider it ran and always succeeds. */
const recordingInvoker = (startedIds: string[]): IKindInvoker => ({
	start: (req): IActiveInvocation => {
		const id = req.decision.targetProvider.id;
		startedIds.push(id);
		return {
			promise: Promise.resolve({ text: `ran:${id}` }),
			cancel: () => undefined,
		};
	},
});

const failing: IKindInvoker = {
	start: (): IActiveInvocation => ({
		promise: Promise.reject(new Error('should not run')),
		cancel: () => undefined,
	}),
};

describe('f00067 S10 — fallback chain (quota-exceeded → next-best → reset → retry)', () => {
	it('picks next-best while the top provider is quota-exceeded, then retries the original after resetAt', async () => {
		const clock = makeClock(Date.parse('2026-07-05T00:00:00.000Z'));
		// `top` (tier 4) out-scores `next` (tier 2) for a plan/maximize task
		// whenever it is available, so it is the deterministic primary winner.
		const providers = [provider('top', 4), provider('next', 2)];
		const resetAt = new Date(clock.now().getTime() + 60_000).toISOString();

		// The in-memory availability mirror, consulted on the hot path. `top`
		// is quota-exceeded until the injected clock passes `resetAt`.
		const availabilityOf = (id: string): IProviderAvailability => {
			if (id === 'top' && clock.now().getTime() < Date.parse(resetAt)) {
				return { id, state: 'quota-exceeded', until: resetAt };
			}
			return { id, state: 'available' };
		};

		const startedIds: string[] = [];
		const invokers: Record<ProviderKind, IKindInvoker> = {
			cli: failing,
			api: failing,
			'mcp-server': failing,
			subscription: recordingInvoker(startedIds),
		};
		const manager = new InvocationManager({
			providers,
			availabilityOf,
			invokers,
			defaultCostPreference: 'balanced',
			invokeTimeoutMs: 5_000,
			maxFallbackDepth: 4,
			fallbackStrategy: 'rerank',
			executeApi: false,
			confirmBeforeExecute: false,
			autoBypassConfirmed: false,
			now: clock.now,
		});

		const invokeArgs = {
			task: 'design the module',
			mode: 'plan' as const,
			capabilityHints: ['code-edit' as const],
			costPreference: 'maximize' as const,
		};

		// Sanity: with `top` down, the REAL planner excludes it and ranks
		// `next` first (a structured routing decision).
		const downChain = planFallbackChain({
			providers,
			availabilityOf,
			hint: {
				mode: 'plan',
				capabilities: ['code-edit'],
				costPref: 'maximize',
			},
			prompt: invokeArgs.task,
			sessionId: 'sess-1',
			strategy: 'rerank',
			maxDepth: 4,
		});
		expect(downChain.map((d) => d.targetProvider.id)).not.toContain('top');
		expect(downChain[0]?.targetProvider.id).toBe('next');

		// The runner picks next-best while `top` is quota-exceeded.
		const first = await manager.invoke(invokeArgs);
		expect(first.error).toBeUndefined();
		expect(first.result?.text).toBe('ran:next');
		expect(first.decision.targetProvider.id).toBe('next');
		// It is a fully structured routing decision, not a stub.
		expect(first.decision.strategy).toBe('passthrough');
		expect(first.decision.scoringTrace.length).toBeGreaterThan(0);
		expect(startedIds).toEqual(['next']);

		// Advance the clock past resetAt — `top` heals back to available.
		clock.advanceMs(61_000);
		expect(availabilityOf('top').state).toBe('available');

		// The runner now retries the original top-scored provider.
		const second = await manager.invoke(invokeArgs);
		expect(second.error).toBeUndefined();
		expect(second.result?.text).toBe('ran:top');
		expect(second.decision.targetProvider.id).toBe('top');
		expect(startedIds).toEqual(['next', 'top']);
	});
});
