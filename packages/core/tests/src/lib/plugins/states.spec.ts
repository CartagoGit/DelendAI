/**
 * states.spec.ts — f00185 (Track D).
 *
 * Covers the plugin state machine: transitions, absorption,
 * rejection errors, and history tracking.
 */

import { describe, expect, it } from 'vitest';

import {
	canTransition,
	createPluginStateMachine,
	PluginStateError,
} from '@mcp-vertex/core/public';
import type { PluginState } from '@mcp-vertex/core/public';

const REASON = { trigger: 'PREPARE' as const, at: 1 };

describe('f00185 — plugin state machine', () => {
	it('starts in UNLOADED', () => {
		const sm = createPluginStateMachine();
		expect(sm.current).toBe('UNLOADED');
	});

	it('UNLOADED → LOADED_HIDDEN is allowed', () => {
		const sm = createPluginStateMachine();
		expect(sm.canTransition('LOADED_HIDDEN')).toBe(true);
		sm.transition('LOADED_HIDDEN', REASON);
		expect(sm.current).toBe('LOADED_HIDDEN');
	});

	it('LOADED_HIDDEN → ACTIVE is allowed', () => {
		const sm = createPluginStateMachine();
		sm.transition('LOADED_HIDDEN', REASON);
		sm.transition('ACTIVE', { trigger: 'ACTIVATE', at: 2 });
		expect(sm.current).toBe('ACTIVE');
	});

	it('ACTIVE → UNLOADED is allowed (dispose path)', () => {
		const sm = createPluginStateMachine();
		sm.transition('LOADED_HIDDEN', REASON);
		sm.transition('ACTIVE', { trigger: 'ACTIVATE', at: 2 });
		sm.transition('UNLOADED', { trigger: 'DISPOSE', at: 3 });
		expect(sm.current).toBe('UNLOADED');
	});

	it('DENIED is absorbing — no outgoing edges', () => {
		const sm = createPluginStateMachine();
		sm.transition('DENIED', { trigger: 'POLICY_DENY', at: 1 });
		expect(sm.current).toBe('DENIED');
		expect(sm.canTransition('ACTIVE')).toBe(false);
		expect(sm.canTransition('LOADED_HIDDEN')).toBe(false);
		expect(sm.canTransition('UNLOADED')).toBe(false);
	});

	it('rejects invalid transitions with a typed error', () => {
		const sm = createPluginStateMachine();
		expect(() =>
			sm.transition('ACTIVE', { trigger: 'ACTIVATE', at: 1 }),
		).toThrow(PluginStateError);
	});

	it('records every transition in history', () => {
		const sm = createPluginStateMachine();
		sm.transition('LOADED_HIDDEN', { trigger: 'PREPARE', at: 1 });
		sm.transition('ACTIVE', { trigger: 'ACTIVATE', at: 2 });
		sm.transition('UNLOADED', { trigger: 'DISPOSE', at: 3 });
		expect(sm.history.length).toBe(3);
		expect(sm.history[0]?.from).toBe('UNLOADED');
		expect(sm.history[0]?.to).toBe('LOADED_HIDDEN');
		expect(sm.history[2]?.to).toBe('UNLOADED');
	});

	it('canTransition is a pure function (no side effects)', () => {
		const transitions: ReadonlyArray<
			readonly [PluginState, PluginState, boolean]
		> = [
			['UNLOADED', 'LOADED_HIDDEN', true],
			['UNLOADED', 'ACTIVE', false],
			['LOADED_HIDDEN', 'ACTIVE', true],
			['ACTIVE', 'UNLOADED', true],
			['ACTIVE', 'LOADED_HIDDEN', false],
			['DENIED', 'UNLOADED', false],
			['DENIED', 'ACTIVE', false],
		];
		for (const [from, to, expected] of transitions) {
			expect(canTransition(from, to)).toBe(expected);
		}
	});

	it('PluginStateError carries the rejected transition metadata', () => {
		const sm = createPluginStateMachine();
		try {
			sm.transition('ACTIVE', { trigger: 'ACTIVATE', at: 1 });
		} catch (e) {
			expect(e).toBeInstanceOf(PluginStateError);
			const err = e as PluginStateError;
			expect(err.from).toBe('UNLOADED');
			expect(err.to).toBe('ACTIVE');
			expect(err.reason.trigger).toBe('ACTIVATE');
		}
	});
});
