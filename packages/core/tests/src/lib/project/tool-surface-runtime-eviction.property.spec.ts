import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';

const makeHandle = () => ({
	enabled: true,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

const PLUGIN_COUNT = 4;

/**
 * Every plugin is registered through `bindLazyTool` first (so all are
 * `isPluginEvictable`) then `bindRegisteredTool`, mirroring the
 * production shape every plugin actually goes through
 * (`assemble-plugins.ts` retains a lazy activator for every plugin
 * regardless of surface mode). `idleTtlMs: null` isolates the property
 * to the LRU (`maxWarmPlugins`) branch, which is the one this fix
 * changed — no wall-clock dependency, no flakiness.
 */
const buildRuntime = (maxWarmPlugins: number) => {
	const runtime = createToolSurfaceRuntime({
		mode: 'managed',
		bootstrapToolIds: [],
		workingSet: { idleTtlMs: null, maxWarmPlugins },
		descriptors: Array.from({ length: PLUGIN_COUNT }, (_, index) => ({
			registrationId: `plugin${index}_run`,
			name: `delendai_plugin${index}_run`,
			toolId: 'run',
			pluginId: `plugin${index}`,
			namespace: `plugin${index}`,
		})),
		plugins: Array.from({ length: PLUGIN_COUNT }, (_, index) => ({
			id: `plugin${index}`,
			namespace: `plugin${index}`,
			toolRegistrationIds: [`plugin${index}_run`],
		})),
	});
	for (let index = 0; index < PLUGIN_COUNT; index += 1) {
		runtime.bindLazyTool({
			registrationId: `plugin${index}_run`,
			activate: async () => ({
				handler: async () => ({ ok: true }),
			}),
		});
		runtime.bindRegisteredTool({
			registrationId: `plugin${index}_run`,
			name: `delendai_plugin${index}_run`,
			handler: async () => ({ ok: true }),
			handle: makeHandle(),
		});
	}
	return runtime;
};

describe('tool-surface-runtime working-set property (x00286 / AUD-C02)', () => {
	it('never keeps more warm plugins than maxWarmPlugins, for any sequence of touch/invoke/evict', async () => {
		const operationArb = fc.record({
			pluginIndex: fc.integer({ min: 0, max: PLUGIN_COUNT - 1 }),
			kind: fc.constantFrom('touch', 'invoke', 'evict'),
		});

		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 1, max: PLUGIN_COUNT }),
				fc.array(operationArb, { minLength: 0, maxLength: 40 }),
				async (maxWarmPlugins, operations) => {
					const runtime = buildRuntime(maxWarmPlugins);
					for (const operation of operations) {
						const namespace = `plugin${operation.pluginIndex}`;
						const toolName = `delendai_${namespace}_run`;
						if (operation.kind === 'touch') {
							runtime.resolveRoute(namespace, 'run');
						} else if (operation.kind === 'invoke') {
							// Awaited before the next operation runs, so no
							// two invocations of this property are ever
							// concurrently in flight — the property is
							// about the LRU bound, not about the
							// in-flight guard (covered separately).
							await runtime.invokeTool(toolName, {}, {});
						} else {
							runtime.evictIdlePlugins();
						}
						const warmCount = runtime.getProjectContext({
							workspaceRoot: '/workspace',
						}).warmPlugins?.length;
						expect(warmCount).toBeLessThanOrEqual(maxWarmPlugins);
					}
				},
			),
			{ numRuns: 200 },
		);
	});
});
