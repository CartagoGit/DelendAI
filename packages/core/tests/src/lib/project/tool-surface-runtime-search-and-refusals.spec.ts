/**
 * tool-surface-runtime-search-and-refusals.spec.ts
 *
 * `tool-surface-runtime.spec.ts` and the eviction specs prove the
 * lifecycle/authorization state machine. This file closes gaps in the
 * two areas coverage showed were untested: `searchTools`' filter
 * predicates (activeOnly/plugin/tag — each is a distinct refinement a
 * caller relies on to narrow a large catalog) and the "identifier not
 * found" refusal paths for plugin activation and lazy binding, which
 * must fail closed (return null / no-op) rather than throw or silently
 * create a bogus record.
 */
import { describe, expect, it } from 'vitest';

import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';
import type { IToolSurfacePlan } from '@delendai/core/lib/contracts/interfaces/tool-surface.interface';

const makeHandle = (enabled = true) => ({
	enabled,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

const buildTwoPluginRuntime = () => {
	const plan: IToolSurfacePlan = {
		mode: 'native',
		bootstrapToolIds: [],
		routerToolId: 'vertex',
		descriptors: [
			{
				registrationId: 'alpha_read',
				name: 'alpha_read',
				toolId: 'read',
				pluginId: 'alpha',
				namespace: 'alpha',
				summary: 'Reads alpha data',
				tags: ['io', 'read'],
			},
			{
				registrationId: 'beta_write',
				name: 'beta_write',
				toolId: 'write',
				pluginId: 'beta',
				namespace: 'beta',
				summary: 'Writes beta data',
				tags: ['io', 'write'],
			},
		],
		plugins: [
			{
				id: 'alpha',
				namespace: 'alpha',
				toolRegistrationIds: ['alpha_read'],
			},
			{
				id: 'beta',
				namespace: 'beta',
				toolRegistrationIds: ['beta_write'],
			},
		],
	};
	const runtime = createToolSurfaceRuntime(plan);
	const alphaHandle = makeHandle();
	const betaHandle = makeHandle();
	runtime.bindRegisteredTool({
		registrationId: 'alpha_read',
		name: 'alpha_read',
		handler: async () => undefined,
		handle: alphaHandle,
	});
	runtime.bindRegisteredTool({
		registrationId: 'beta_write',
		name: 'beta_write',
		handler: async () => undefined,
		handle: betaHandle,
	});
	runtime.finalizeInitialSurface();
	return { runtime, alphaHandle, betaHandle };
};

describe('tool-surface-runtime searchTools filters', () => {
	it('activeOnly excludes tools whose plugin has been deactivated', () => {
		const { runtime } = buildTwoPluginRuntime();
		runtime.deactivatePlugin('beta');

		const names = runtime
			.searchTools({ activeOnly: true })
			.map((entry) => entry.name);

		expect(names).toEqual(['alpha_read']);
	});

	it('the plugin filter matches by plugin id OR namespace, case-insensitively', () => {
		const { runtime } = buildTwoPluginRuntime();

		expect(
			runtime.searchTools({ plugin: 'ALPHA' }).map((entry) => entry.name),
		).toEqual(['alpha_read']);
		expect(runtime.searchTools({ plugin: 'nonexistent-plugin' })).toEqual(
			[],
		);
	});

	it('the tag filter matches case-insensitively and excludes tools without the tag', () => {
		const { runtime } = buildTwoPluginRuntime();

		expect(
			runtime.searchTools({ tag: 'WRITE' }).map((entry) => entry.name),
		).toEqual(['beta_write']);
		expect(runtime.searchTools({ tag: 'not-a-real-tag' })).toEqual([]);
	});

	it('a blank query (whitespace-only) is treated the same as no query at all', () => {
		const { runtime } = buildTwoPluginRuntime();

		const names = runtime
			.searchTools({ query: '   ' })
			.map((entry) => entry.name)
			.sort();

		expect(names).toEqual(['alpha_read', 'beta_write']);
	});
});

describe('tool-surface-runtime unknown-identifier refusals', () => {
	it('activatePlugin returns null for an identifier that matches no plugin', () => {
		const { runtime } = buildTwoPluginRuntime();
		expect(runtime.activatePlugin('does-not-exist')).toBeNull();
	});

	it('deactivatePlugin returns null for an identifier that matches no plugin', () => {
		const { runtime } = buildTwoPluginRuntime();
		expect(runtime.deactivatePlugin('does-not-exist')).toBeNull();
	});

	it('activatePluginAsync returns null and never invokes the lazy loader for an unknown identifier', async () => {
		const { runtime } = buildTwoPluginRuntime();
		let loaderCalls = 0;
		runtime.setLazyPluginLoader?.(async () => {
			loaderCalls += 1;
		});

		const result = await runtime.activatePluginAsync?.('does-not-exist');

		expect(result).toBeNull();
		expect(loaderCalls).toBe(0);
	});

	it('bindLazyTool silently no-ops for a registrationId absent from the plan descriptors', () => {
		const { runtime } = buildTwoPluginRuntime();

		// No descriptor named "ghost" exists in the plan built by
		// buildTwoPluginRuntime — this must not create a phantom tool.
		runtime.bindLazyTool({
			registrationId: 'ghost',
			activate: async () => ({ handler: async () => undefined }),
		});

		expect(
			runtime.searchTools().map((entry) => entry.registrationId),
		).toEqual(expect.not.arrayContaining(['ghost']));
	});

	it('getToolExposure reports unknown and isToolExposed stays fail-closed for a name that was never bound', () => {
		const { runtime } = buildTwoPluginRuntime();
		expect(runtime.getToolExposure('never-bound-tool-name')).toBe(
			'unknown',
		);
		expect(runtime.isToolExposed('never-bound-tool-name')).toBe(false);
	});

	it('resolveRoute returns undefined, without side effects, when no tool matches the domain/action pair', () => {
		const { runtime } = buildTwoPluginRuntime();
		const before = runtime.getProjectContext({ workspaceRoot: '/repo' });

		const found = runtime.resolveRoute('alpha', 'no-such-action');

		expect(found).toBeUndefined();
		const after = runtime.getProjectContext({ workspaceRoot: '/repo' });
		expect(after.warmPlugins).toEqual(before.warmPlugins);
	});
});
