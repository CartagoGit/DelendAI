import { describe, expect, it } from 'vitest';

import type { IRoutingDecision } from '@mcp-vertex/core/public';

import { SessionStore } from '../../../../src/lib/router/session';

const decision = (sessionId: string): IRoutingDecision => ({
	strategy: 'api',
	targetProvider: {
		id: 'p',
		kind: 'api',
		invoke: { kind: 'api', url: 'https://x', envVar: 'K' },
		modelId: 'm',
		contextWindow: 1000,
		costTier: 2,
		strengths: [],
		weaknesses: [],
	},
	mode: 'implement',
	prompt: 'x',
	invoke: { kind: 'api', url: 'https://x', envVar: 'K' },
	rationale: 'r',
	estimatedCostTier: 2,
	alternates: [],
	scoringTrace: [],
	sessionId,
});

describe('SessionStore (CRITICAL I12)', () => {
	it('remembers a decision until its TTL elapses', () => {
		let now = 1_000_000;
		const store = new SessionStore({ ttlSeconds: 300, now: () => now });
		store.set('s', decision('s'));
		expect(store.get('s')?.sessionId).toBe('s');
		now += 299_000; // still inside 300s
		expect(store.get('s')).toBeDefined();
		now += 2_000; // now past 301s
		expect(store.get('s')).toBeUndefined();
	});

	it('evicts an expired entry lazily on get (treated as a miss)', () => {
		let now = 0;
		const store = new SessionStore({ ttlSeconds: 1, now: () => now });
		store.set('s', decision('s'));
		expect(store.size).toBe(1);
		now = 2_000;
		expect(store.get('s')).toBeUndefined();
		expect(store.size).toBe(0);
	});

	it('returns undefined for an unknown session', () => {
		const store = new SessionStore();
		expect(store.get('nope')).toBeUndefined();
	});

	it('prune() drops every expired entry and returns the count', () => {
		let now = 0;
		const store = new SessionStore({ ttlSeconds: 10, now: () => now });
		store.set('a', decision('a'));
		store.set('b', decision('b'));
		now = 20_000;
		store.set('c', decision('c')); // fresh
		expect(store.prune()).toBe(2);
		expect(store.size).toBe(1);
		expect(store.get('c')).toBeDefined();
	});

	it('startPruneTimer is idempotent and stop() releases the handle', () => {
		const store = new SessionStore({ ttlSeconds: 1 });
		expect(() => {
			store.startPruneTimer(10);
			store.startPruneTimer(10); // no-op second call
			store.stop();
			store.stop(); // safe to stop twice
		}).not.toThrow();
	});
});
