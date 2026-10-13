import { describe, expect, it, vi } from 'vitest';

import { loadPlugins } from '@delendai/core/lib/plugins/load-plugins';
import type { IMcpPluginContext } from '@delendai/core/lib/plugins/plugin-contract';
import type { IPluginRuntime } from '@delendai/core/lib/contracts/interfaces/plugin-runtime.interface';
import { extractPartialRuntime } from '@delendai/core/lib/plugins/load-plugins-runtime.helper';

const ctx = (name: string, cacheNamespace?: string): IMcpPluginContext => ({
	workspace: { root: '/ws', resolve: (path: string) => `/ws/${path}` },
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: `.cache/delendai/${cacheNamespace ? `${cacheNamespace}/${name}` : name}`,
	pluginDocsDir: `docs/delendai/${name}`,
	namespacePrefix: name,
	options: {},
	args: {},
});

const asImport =
	(plugins: Record<string, unknown>) =>
	async (specifier: string): Promise<{ default: unknown }> => {
		for (const [key, plugin] of Object.entries(plugins)) {
			if (specifier.includes(`/${key}`) || specifier === key) {
				return { default: plugin };
			}
		}
		return { default: Object.values(plugins)[0] };
	};

describe('loadPlugins register cancel and dispose lifecycle', async () => {
	it('aborts the underlying register work when timeout expires for an abortable plugin', async () => {
		let observedAbort = false;
		const plugin = {
			name: 'abortable',
			register: (_ctx: IMcpPluginContext, signal?: AbortSignal) =>
				new Promise<IPluginRuntime<{ tools: [] }>>(
					(_resolve, reject) => {
						signal?.addEventListener(
							'abort',
							() => {
								observedAbort = true;
								reject(signal.reason ?? new Error('aborted'));
							},
							{ once: true },
						);
					},
				),
		};

		const result = await loadPlugins({
			specifiers: ['abortable'],
			buildContext: ctx,
			import: asImport({ abortable: plugin }),
			timeoutMs: 20,
		});

		expect(observedAbort).toBe(true);
		expect(result.loaded).toEqual([]);
		expect(result.errors[0]?.message).toMatch(/timed out after 20ms/);
	});

	it('rolls back active plugins in reverse order when an external signal aborts the batch', async () => {
		const events: string[] = [];
		const controller = new AbortController();
		const plugins = {
			alpha: {
				name: 'alpha',
				register: () => ({
					registrations: { tools: [] },
					dispose: () => {
						events.push('dispose:alpha');
					},
				}),
			},
			beta: {
				name: 'beta',
				register: (_ctx: IMcpPluginContext, signal?: AbortSignal) =>
					new Promise<IPluginRuntime<{ tools: [] }>>(
						(_resolve, reject) => {
							signal?.addEventListener(
								'abort',
								() => {
									events.push('abort:beta');
									reject(
										signal.reason ?? new Error('aborted'),
									);
								},
								{ once: true },
							);
							queueMicrotask(() =>
								controller.abort(new Error('stop batch')),
							);
						},
					),
			},
		};

		const result = await loadPlugins({
			specifiers: ['alpha', 'beta'],
			buildContext: ctx,
			import: asImport(plugins),
			signal: controller.signal,
			timeoutMs: 100,
		});

		expect(result.loaded).toEqual([]);
		expect(events).toEqual(['abort:beta', 'dispose:alpha']);
		expect(result.errors[0]?.message).toMatch(
			/aborted by signal|stop batch/,
		);
	});

	it('rolls back previously active plugins in reverse order when a later register fails', async () => {
		const events: string[] = [];
		const plugins = {
			alpha: {
				name: 'alpha',
				register: () => ({
					registrations: { tools: [] },
					dispose: () => {
						events.push('dispose:alpha');
					},
				}),
			},
			beta: {
				name: 'beta',
				register: () => ({
					registrations: { tools: [] },
					dispose: () => {
						events.push('dispose:beta');
					},
				}),
			},
			gamma: {
				name: 'gamma',
				register: () => {
					const error = new Error('gamma boom') as Error & {
						runtime?: IPluginRuntime<{ tools: [] }>;
					};
					error.runtime = {
						registrations: { tools: [] },
						dispose: () => {
							events.push('dispose:gamma-partial');
						},
					};
					throw error;
				},
			},
		};

		const result = await loadPlugins({
			specifiers: ['alpha', 'beta', 'gamma'],
			buildContext: ctx,
			import: asImport(plugins),
		});

		expect(result.loaded).toEqual([]);
		expect(events).toEqual([
			'dispose:gamma-partial',
			'dispose:beta',
			'dispose:alpha',
		]);
		expect(result.errors[0]?.message).toMatch(/gamma boom/);
	});

	it('continues teardown when one dispose throws', async () => {
		const disposeAfterFailure = vi.fn();
		const plugins = {
			alpha: {
				name: 'alpha',
				register: () => ({
					registrations: { tools: [] },
					dispose: () => {
						throw new Error('alpha dispose boom');
					},
				}),
			},
			beta: {
				name: 'beta',
				register: () => ({
					registrations: { tools: [] },
					dispose: disposeAfterFailure,
				}),
			},
			gamma: {
				name: 'gamma',
				register: () => {
					throw new Error('gamma boom');
				},
			},
		};

		const result = await loadPlugins({
			specifiers: ['alpha', 'beta', 'gamma'],
			buildContext: ctx,
			import: asImport(plugins),
		});

		expect(result.loaded).toEqual([]);
		expect(disposeAfterFailure).toHaveBeenCalledTimes(1);
		expect(
			result.errors.some((entry) =>
				/dispose\(\) failed during rollback/.test(entry.message),
			),
		).toBe(true);
	});

	it('keeps backward compatibility for plugins that return registrations directly', async () => {
		const result = await loadPlugins({
			specifiers: ['legacy'],
			buildContext: ctx,
			import: asImport({
				legacy: {
					name: 'legacy',
					register: () => ({
						tools: [
							{ id: 'legacy_tool', register: async () => {} },
						],
					}),
				},
			}),
		});

		expect(result.errors).toEqual([]);
		expect(result.loaded[0]?.registrations.tools?.[0]?.id).toBe(
			'legacy_tool',
		);
		expect(result.loaded[0]?.runtime.abortable).toBe(false);
	});

	// t00015 (LIFE-001 regression guard, case #10) — a plugin whose
	// `register()` throws AFTER constructing a runtime (the "late
	// resolution" pattern: the runtime is built at the moment of
	// failure rather than before register ran) MUST have its late-
	// attached runtime disposed on the rollback path. The lifecycle
	// extracts the runtime from the thrown error via
	// `extractPartialRuntime` and runs `dispose()` BEFORE reverting
	// the DAG state. Without this guard a plugin that "leaked" a
	// runtime into the error path would silently keep timers / file
	// handles alive past the abort.
	it('t00015: disposes a LATE-RESOLVED runtime extracted from a thrown error', async () => {
		const events: string[] = [];
		const partialDispose = vi.fn(() => {
			events.push('dispose:partial');
		});
		const plugin = {
			name: 'late-resolution',
			register: () => {
				const error = new Error('late boom') as Error & {
					runtime?: IPluginRuntime<{ tools: [] }>;
				};
				error.runtime = {
					registrations: { tools: [] },
					dispose: partialDispose,
				};
				throw error;
			},
		};

		const result = await loadPlugins({
			specifiers: ['late-resolution'],
			buildContext: ctx,
			import: asImport({ 'late-resolution': plugin }),
		});

		expect(result.loaded).toEqual([]);
		expect(partialDispose).toHaveBeenCalledTimes(1);
		expect(events).toEqual(['dispose:partial']);
		expect(result.registerErrors[0]?.error).toBeInstanceOf(Error);
	});
});

describe('extractPartialRuntime (t00015 primitive)', () => {
	it('returns a normalised runtime when one is attached via error.runtime', () => {
		const dispose = vi.fn();
		const error = Object.assign(new Error('boom'), {
			runtime: {
				registrations: { tools: [] },
				dispose,
			},
		});

		const extracted = extractPartialRuntime(error);
		expect(extracted?.registrations.tools).toEqual([]);
		expect(extracted?.dispose).toBe(dispose);
		expect(extracted?.abortable).toBe(true);
	});

	it('returns a normalised runtime when registrations are attached directly to the error', () => {
		const dispose = vi.fn();
		const error = Object.assign(new Error('boom'), {
			registrations: { tools: [{ id: 'late-tool' }] },
			dispose,
		});

		const extracted = extractPartialRuntime(error);
		expect(extracted?.registrations.tools).toEqual([{ id: 'late-tool' }]);
		expect(extracted?.dispose).toBe(dispose);
	});

	it('returns undefined for a plain Error with no runtime hint', () => {
		expect(extractPartialRuntime(new Error('boom'))).toBeUndefined();
	});

	it('returns undefined for non-object inputs', () => {
		expect(extractPartialRuntime('boom')).toBeUndefined();
		expect(extractPartialRuntime(null)).toBeUndefined();
		expect(extractPartialRuntime(undefined)).toBeUndefined();
	});

	it('respects an explicit abortable: false override on a late runtime', () => {
		const error = Object.assign(new Error('boom'), {
			runtime: {
				registrations: { tools: [] },
				dispose: vi.fn(),
				abortable: false,
			},
		});

		const extracted = extractPartialRuntime(error);
		expect(extracted?.abortable).toBe(false);
	});
});
