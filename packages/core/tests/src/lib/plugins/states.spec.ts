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
} from '@delendai/core/public';
import type { PluginState } from '@delendai/core/public';
import { createLazyPluginDiscovery } from '../../../../src/lib/plugins/discovery';
import type {
	ILazyPluginLoader,
	IPluginManifest,
} from '../../../../src/lib/plugins/lazy-loader';
import { createPluginManager } from '../../../../src/lib/plugins/plugin-manager';
import {
	createLazyPluginRouter,
	PluginRouteStateError,
} from '../../../../src/lib/plugins/router';

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

	it('emits a transition event for each state change', () => {
		const sm = createPluginStateMachine();
		const events: Array<{ from: PluginState; to: PluginState }> = [];
		sm.onTransition((event) => {
			events.push({ from: event.from, to: event.to });
		});
		sm.transition('LOADED_HIDDEN', { trigger: 'PREPARE', at: 1 });
		sm.transition('ACTIVE', { trigger: 'ACTIVATE', at: 2 });
		expect(events).toEqual([
			{ from: 'UNLOADED', to: 'LOADED_HIDDEN' },
			{ from: 'LOADED_HIDDEN', to: 'ACTIVE' },
		]);
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

const manifest = (
	id: string,
	toolNames: readonly string[],
): IPluginManifest => ({
	id,
	version: '1.0.0',
	toolNames,
	promptNames: [],
	resourceUris: [],
});

const createLoader = (): ILazyPluginLoader => ({
	async readManifest(id) {
		if (id === 'alpha' || id === 'beta') {
			return manifest(id, [`${id}.tool`]);
		}
		return undefined;
	},
	async load(id) {
		return {
			id,
			manifest: manifest(id, [`${id}.tool`]),
			plugin: {
				name: id,
				version: '1.0.0',
				async register() {
					return { tools: [] };
				},
			},
			firstLoadMs: 0,
			loadedAt: 1,
		};
	},
	async warmup() {
		return [];
	},
	state() {
		return 'unloaded';
	},
	snapshot() {
		return { loaded: [], failed: [] };
	},
	async unload() {
		return false;
	},
	stats() {
		return { manifestsRead: 0, modulesImported: 0, firstLoadTotalMs: 0 };
	},
	reset() {},
});

const createRouterRig = async () => {
	const loader = createLoader();
	const discovery = createLazyPluginDiscovery({
		loader,
		listPluginIds: async () => ['alpha', 'beta'],
	});
	const router = createLazyPluginRouter({
		loader,
		discovery,
		lazy: true,
	});
	await router.initialize();
	return { router };
};

describe('f00269 — router integration', () => {
	it('listTools excludes plugins that are not ACTIVE', async () => {
		const { router } = await createRouterRig();
		expect(await router.listTools()).toEqual(['alpha.tool', 'beta.tool']);
		router.transitionPlugin('beta', 'DENIED', {
			trigger: 'POLICY_DENY',
			at: 1,
		});
		expect(await router.listTools()).toEqual(['alpha.tool']);
		expect(await router.resolveTool('beta.tool')).toBeUndefined();
	});

	it('loadToolOwner rejects non-ACTIVE plugins with a typed refusal', async () => {
		const { router } = await createRouterRig();
		router.transitionPlugin('alpha', 'UNLOADED', {
			trigger: 'DISPOSE',
			at: 1,
		});
		await expect(router.loadToolOwner('alpha.tool')).rejects.toBeInstanceOf(
			PluginRouteStateError,
		);
		await expect(router.loadToolOwner('alpha.tool')).rejects.toMatchObject({
			kind: 'plugin-not-active',
			pluginId: 'alpha',
			state: 'UNLOADED',
		});
	});

	it('router exposes transition events for metrics consumers', async () => {
		const { router } = await createRouterRig();
		const events: string[] = [];
		router.onPluginStateTransition((event) => {
			events.push(`${event.pluginId}:${event.from}->${event.to}`);
		});
		router.transitionPlugin('alpha', 'DENIED', {
			trigger: 'POLICY_DENY',
			at: 1,
		});
		expect(events).toEqual(['alpha:ACTIVE->DENIED']);
	});
});

describe('f00269 — plugin-manager integration', () => {
	it('hide transitions ACTIVE plugins out of the visible tool surface', async () => {
		const { router } = await createRouterRig();
		const manager = createPluginManager(router);
		manager.hide('alpha');
		expect(router.pluginState('alpha')).toBe('LOADED_HIDDEN');
		expect(await router.resolveTool('alpha.tool')).toBeUndefined();
	});

	it('activate restores a plugin after unload', async () => {
		const { router } = await createRouterRig();
		const manager = createPluginManager(router);
		manager.unload('alpha');
		expect(manager.activate('alpha')).toBe('ACTIVE');
		expect(await router.resolveTool('alpha.tool')).toBeDefined();
	});

	it('hide before initialize rejects without mutating state', () => {
		const loader = createLoader();
		const discovery = createLazyPluginDiscovery({
			loader,
			listPluginIds: async () => ['alpha', 'beta'],
		});
		const router = createLazyPluginRouter({
			loader,
			discovery,
			lazy: true,
		});
		const manager = createPluginManager(router);
		expect(() => manager.hide('alpha')).toThrow(
			'plugin router must be initialized',
		);
		expect(router.pluginState('alpha')).toBeUndefined();
	});

	it('does not create state for an unknown plugin after initialize', async () => {
		const { router } = await createRouterRig();
		const manager = createPluginManager(router);
		expect(() => manager.activate('ghost')).toThrow(
			'unknown plugin "ghost"',
		);
		expect(router.pluginState('ghost')).toBeUndefined();
	});

	it('does not activate an unknown plugin before initialize', () => {
		const loader = createLoader();
		const discovery = createLazyPluginDiscovery({
			loader,
			listPluginIds: async () => ['alpha', 'beta'],
		});
		const router = createLazyPluginRouter({
			loader,
			discovery,
			lazy: true,
		});
		const manager = createPluginManager(router);
		expect(() => manager.activate('ghost')).toThrow(
			'plugin router must be initialized',
		);
		expect(router.pluginState('ghost')).toBeUndefined();
	});

	it('does not deny an unknown plugin before initialize', () => {
		const loader = createLoader();
		const discovery = createLazyPluginDiscovery({
			loader,
			listPluginIds: async () => ['alpha', 'beta'],
		});
		const router = createLazyPluginRouter({
			loader,
			discovery,
			lazy: true,
		});
		const manager = createPluginManager(router);
		expect(() => manager.deny('ghost')).toThrow(
			'plugin router must be initialized',
		);
		expect(router.pluginState('ghost')).toBeUndefined();
	});

	it('deny is absorbing through the manager API', async () => {
		const { router } = await createRouterRig();
		const manager = createPluginManager(router);
		manager.deny('alpha', 'policy');
		expect(manager.state('alpha')).toBe('DENIED');
		expect(manager.activate('alpha')).toBe('DENIED');
	});
});
