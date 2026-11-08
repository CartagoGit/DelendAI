import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import { DEFAULT_WORKING_SET_POLICY } from '@delendai/core/lib/contracts/constants/working-set-policy.constant';
import type { IToolSurfaceWorkingSetPolicy } from '@delendai/core/lib/contracts/interfaces/tool-surface.interface';
import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';

const PLUGIN_COUNT = 4;
const MIN_WARM_MS = 30_000;

const makeHandle = () => ({
	enabled: true,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

/** Every plugin lazily bound first, so each one is evictable. */
const buildRuntime = (workingSet: IToolSurfaceWorkingSetPolicy) => {
	const runtime = createToolSurfaceRuntime({
		mode: 'managed',
		bootstrapToolIds: [],
		workingSet,
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
			activate: async () => ({ handler: async () => ({ ok: true }) }),
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

const warmOf = (runtime: ReturnType<typeof buildRuntime>): Set<string> =>
	new Set(
		runtime.getProjectContext({ workspaceRoot: '/workspace' })
			.warmPlugins ?? [],
	);

const operationArb = fc.oneof(
	fc.record({
		kind: fc.constant('touch' as const),
		pluginIndex: fc.integer({ min: 0, max: PLUGIN_COUNT - 1 }),
	}),
	fc.record({
		kind: fc.constant('advance' as const),
		ms: fc.integer({ min: 0, max: MIN_WARM_MS * 2 }),
	}),
	fc.record({ kind: fc.constant('evict' as const) }),
);

describe('tool-surface-runtime activation hysteresis', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(0);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('never evicts a plugin within minWarmMs of it becoming warm, for any sequence of touches, idle time and eviction passes', () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: PLUGIN_COUNT }),
				fc.constantFrom<number | null>(null, 0, 1_000, 10_000),
				fc.array(operationArb, { maxLength: 40 }),
				(maxWarmPlugins, idleTtlMs, operations) => {
					vi.setSystemTime(0);
					const runtime = buildRuntime({
						idleTtlMs,
						maxWarmPlugins,
						minWarmMs: MIN_WARM_MS,
					});
					const activatedAt = new Map<string, number>();
					let before = warmOf(runtime);
					for (const operation of operations) {
						if (operation.kind === 'touch') {
							runtime.resolveRoute(
								`plugin${operation.pluginIndex}`,
								'run',
							);
						} else if (operation.kind === 'advance') {
							vi.setSystemTime(Date.now() + operation.ms);
						} else {
							runtime.evictIdlePlugins();
						}
						const now = Date.now();
						const after = warmOf(runtime);
						for (const pluginId of before) {
							if (after.has(pluginId)) continue;
							expect(
								now -
									(activatedAt.get(pluginId) ??
										Number.NEGATIVE_INFINITY),
							).toBeGreaterThanOrEqual(MIN_WARM_MS);
							activatedAt.delete(pluginId);
						}
						for (const pluginId of after) {
							if (!before.has(pluginId))
								activatedAt.set(pluginId, now);
						}
						before = after;
					}
				},
			),
			{ numRuns: 300 },
		);
	});

	it('restores the working-set bound once minWarmMs has passed', () => {
		const runtime = buildRuntime({
			idleTtlMs: null,
			maxWarmPlugins: 1,
			minWarmMs: MIN_WARM_MS,
		});
		for (let index = 0; index < PLUGIN_COUNT; index += 1) {
			runtime.resolveRoute(`plugin${index}`, 'run');
		}
		expect(warmOf(runtime).size).toBe(PLUGIN_COUNT);

		vi.setSystemTime(MIN_WARM_MS);
		runtime.evictIdlePlugins();

		expect([...warmOf(runtime)]).toEqual([`plugin${PLUGIN_COUNT - 1}`]);
	});

	it('evicts as before when minWarmMs is absent or null', () => {
		for (const minWarmMs of [undefined, null, 0]) {
			const runtime = buildRuntime({
				idleTtlMs: null,
				maxWarmPlugins: 1,
				...(minWarmMs === undefined ? {} : { minWarmMs }),
			});
			runtime.resolveRoute('plugin0', 'run');
			vi.setSystemTime(Date.now() + 1);
			runtime.resolveRoute('plugin1', 'run');

			expect([...warmOf(runtime)]).toEqual(['plugin1']);
		}
	});

	it('an explicit deactivation is not held back by minWarmMs', () => {
		const runtime = buildRuntime(DEFAULT_WORKING_SET_POLICY);
		runtime.resolveRoute('plugin0', 'run');

		runtime.deactivatePlugin('plugin0');

		expect(warmOf(runtime).has('plugin0')).toBe(false);
	});
});
