import { describe, expect, it } from 'vitest';

import { createToolSurfaceRuntime } from '@delendai/core/lib/project/tool-surface-runtime.service';
import type { IToolSurfacePlan } from '@delendai/core/lib/contracts/interfaces/tool-surface.interface';

const makeHandle = () => ({
	enabled: true,
	enable() {
		this.enabled = true;
	},
	disable() {
		this.enabled = false;
	},
});

const DESCRIPTORS: IToolSurfacePlan['descriptors'] = [
	{
		registrationId: 'ledger_close',
		name: 'delendai_ledger_close',
		toolId: 'ledger_close',
		pluginId: 'billing',
		namespace: 'billing',
		summary: 'Closes the monthly books',
		tags: ['accounting'],
	},
	{
		registrationId: 'git_status',
		name: 'delendai_git_status',
		toolId: 'status',
		pluginId: 'git',
		namespace: 'git',
		summary: 'Working tree state of the checkout',
		tags: ['vcs', 'read'],
	},
	{
		registrationId: 'memory_recall',
		name: 'delendai_memory_recall',
		toolId: 'recall',
		pluginId: 'memory',
		namespace: 'memory',
		summary: 'Search stored project memories by topic',
		tags: ['memory', 'search'],
	},
];

const buildRuntime = () => {
	const runtime = createToolSurfaceRuntime({
		mode: 'native',
		bootstrapToolIds: [],
		descriptors: DESCRIPTORS,
		plugins: DESCRIPTORS.map((descriptor) => ({
			id: descriptor.pluginId!,
			namespace: descriptor.namespace!,
			toolRegistrationIds: [descriptor.registrationId],
		})),
	});
	for (const descriptor of DESCRIPTORS) {
		runtime.bindRegisteredTool({
			registrationId: descriptor.registrationId,
			name: descriptor.name,
			handler: async () => undefined,
			handle: makeHandle(),
		});
	}
	runtime.finalizeInitialSurface();
	return runtime;
};

describe('tool-surface-runtime search confidence', () => {
	it('finds every tool by its id, its name and each of its tags', () => {
		const runtime = buildRuntime();
		for (const descriptor of DESCRIPTORS) {
			for (const query of [
				descriptor.toolId,
				descriptor.name,
				...(descriptor.tags ?? []),
			]) {
				const result = runtime.rankTools({ query });
				expect(result.found, query).toBe(true);
				expect(
					result.entries.map((entry) => entry.registrationId),
					query,
				).toContain(descriptor.registrationId);
			}
		}
	});

	it('ranks the reference match first', () => {
		const runtime = buildRuntime();

		expect(runtime.rankTools({ query: 'status' }).entries[0]?.name).toBe(
			'delendai_git_status',
		);
		expect(runtime.rankTools({ query: 'vcs' }).entries[0]?.name).toBe(
			'delendai_git_status',
		);
	});

	it('answers found=false, naming where the weak matches are, instead of returning them', () => {
		const runtime = buildRuntime();

		const result = runtime.rankTools({ query: 'billing monthly' });

		expect(result).toEqual({
			entries: [],
			found: false,
			suggestion: expect.stringContaining(
				'Weak matches are in: billing.',
			),
		});
	});

	it('answers found=false with a way forward when nothing matches at all', () => {
		const result = buildRuntime().rankTools({ query: 'kubernetes' });

		expect(result.found).toBe(false);
		expect(result.entries).toEqual([]);
		expect(result.suggestion).toContain('an empty query lists the catalog');
	});

	it('minScore=0 returns the weak matches it would otherwise withhold', () => {
		const result = buildRuntime().rankTools({
			query: 'billing monthly',
			minScore: 0,
		});

		expect(result.found).toBe(true);
		expect(result.entries.map((entry) => entry.registrationId)).toEqual([
			'ledger_close',
		]);
	});

	it('applies no threshold when there is no query to be confident about', () => {
		const result = buildRuntime().rankTools({ plugin: 'billing' });

		expect(result.found).toBe(true);
		expect(result.entries).toHaveLength(1);
	});

	it('searchTools still returns every match, weak ones included', () => {
		expect(
			buildRuntime()
				.searchTools({ query: 'billing monthly' })
				.map((entry) => entry.registrationId),
		).toEqual(['ledger_close']);
	});
});
