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

const buildRuntime = (descriptors: IToolSurfacePlan['descriptors']) => {
	const runtime = createToolSurfaceRuntime({
		mode: 'native',
		bootstrapToolIds: [],
		routerToolId: 'vertex',
		descriptors,
		plugins: descriptors.map((descriptor) => ({
			id: descriptor.pluginId ?? descriptor.registrationId,
			namespace:
				descriptor.namespace ??
				descriptor.pluginId ??
				descriptor.registrationId,
			toolRegistrationIds: [descriptor.registrationId],
		})),
	});

	for (const descriptor of descriptors) {
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

describe('tool-surface-runtime searchTools ranking (f00273-S1)', () => {
	it('orders matches by heuristic score instead of descriptor insertion order', () => {
		const runtime = buildRuntime([
			{
				registrationId: 'summary_search',
				name: 'zeta_tool',
				toolId: 'zeta',
				pluginId: 'zeta',
				namespace: 'zeta',
				summary: 'Runs search workflows for archived records',
				tags: ['archive'],
			},
			{
				registrationId: 'tagged_gamma',
				name: 'gamma_tool',
				toolId: 'gamma',
				pluginId: 'gamma',
				namespace: 'gamma',
				summary: 'General purpose gamma helper',
				tags: ['search'],
			},
			{
				registrationId: 'prefix_search',
				name: 'search_console',
				toolId: 'console',
				pluginId: 'console',
				namespace: 'console',
				summary: 'Interactive console',
				tags: ['console'],
			},
			{
				registrationId: 'exact_search',
				name: 'alpha_tool',
				toolId: 'search',
				pluginId: 'alpha',
				namespace: 'alpha',
				summary: 'Alpha search entry point',
				tags: ['alpha'],
			},
		]);

		expect(
			runtime.searchTools({ query: 'search' }).map((entry) => entry.name),
		).toEqual(['alpha_tool', 'search_console', 'gamma_tool', 'zeta_tool']);
	});

	it('breaks equal-score ties deterministically by name', () => {
		const runtime = buildRuntime([
			{
				registrationId: 'search_runner',
				name: 'search_runner',
				toolId: 'runner',
				pluginId: 'runner',
				namespace: 'runner',
				summary: 'Runner commands',
				tags: ['runner'],
			},
			{
				registrationId: 'search',
				name: 'search',
				toolId: 'utility',
				pluginId: 'utility',
				namespace: 'utility',
				summary: 'Utility commands',
				tags: ['utility'],
			},
		]);

		expect(
			runtime.searchTools({ query: 'search' }).map((entry) => entry.name),
		).toEqual(['search', 'search_runner']);
	});

	it('uses locale-independent binary ordering for equal-score non-ASCII names', () => {
		const runtime = buildRuntime([
			{
				registrationId: 'search_ascii',
				name: 'searchZ',
				toolId: 'ascii',
				pluginId: 'ascii',
				namespace: 'ascii',
				summary: 'ASCII variant',
				tags: ['ascii'],
			},
			{
				registrationId: 'search_non_ascii',
				name: 'searchÄ',
				toolId: 'non_ascii',
				pluginId: 'non_ascii',
				namespace: 'non_ascii',
				summary: 'Non ASCII variant',
				tags: ['non-ascii'],
			},
		]);

		expect(
			runtime.searchTools({ query: 'search' }).map((entry) => entry.name),
		).toEqual(['searchZ', 'searchÄ']);
	});

	it('keeps blank-query results in a deterministic alphabetical order', () => {
		const runtime = buildRuntime([
			{
				registrationId: 'beta_tool',
				name: 'beta_tool',
				toolId: 'beta',
				pluginId: 'beta',
				namespace: 'beta',
			},
			{
				registrationId: 'alpha_tool',
				name: 'alpha_tool',
				toolId: 'alpha',
				pluginId: 'alpha',
				namespace: 'alpha',
			},
			{
				registrationId: 'gamma_tool',
				name: 'gamma_tool',
				toolId: 'gamma',
				pluginId: 'gamma',
				namespace: 'gamma',
			},
		]);

		expect(
			runtime.searchTools({ query: '   ' }).map((entry) => entry.name),
		).toEqual(['alpha_tool', 'beta_tool', 'gamma_tool']);
	});
});

describe('a search that narrows as you say more (x00604)', () => {
	const runtime = () =>
		buildRuntime([
			{
				registrationId: 'delendai_proposals_sync_proposals',
				name: 'delendai_proposals_sync_proposals',
				toolId: 'sync_proposals',
				pluginId: 'proposals',
				namespace: 'proposals',
				summary: 'Regenerate the proposal index from the .md files.',
				tags: ['proposals'],
			},
			{
				registrationId: 'delendai_logs_query',
				name: 'delendai_logs_query',
				toolId: 'query',
				pluginId: 'logs',
				namespace: 'logs',
				summary: 'Query the structured log index.',
				tags: ['logs'],
			},
		]);

	it('finds a tool described in words, not only by its exact name', () => {
		// Measured live through the MCP surface, against a consumer
		// project: `tool_search('sync_proposals')` answered, and
		// `tool_search('sync proposals index')` — every word of which
		// appears in that tool's own name and summary — answered
		// `{"entries":[]}`.
		//
		// With 148 tools behind a lazy surface, the tool an agent is told
		// to use to FIND tools was telling it the capability does not
		// exist.
		const found = runtime().searchTools({
			query: 'sync proposals index',
		});
		expect(found.map((entry) => entry.toolId)).toEqual(['sync_proposals']);
	});

	it('still answers an exact name, which is what already worked', () => {
		expect(
			runtime()
				.searchTools({ query: 'sync_proposals' })
				.map((entry) => entry.toolId),
		).toEqual(['sync_proposals']);
	});

	it('narrows as words are added, rather than widening', () => {
		// Every token must appear. Matching ANY token would make a third
		// word widen the answer, and "sync proposals index" would return
		// everything that mentions an index — including the log query.
		const one = runtime().searchTools({ query: 'index' });
		expect(one.length).toBe(2);
		const two = runtime().searchTools({ query: 'index proposal' });
		expect(two.map((entry) => entry.toolId)).toEqual(['sync_proposals']);
	});

	it('is unbothered by the spacing somebody types', () => {
		expect(
			runtime()
				.searchTools({ query: '  proposals   index  ' })
				.map((entry) => entry.toolId),
		).toEqual(['sync_proposals']);
	});

	it('returns everything for an empty query, as before', () => {
		expect(runtime().searchTools({ query: '   ' }).length).toBe(2);
		expect(runtime().searchTools({}).length).toBe(2);
	});
});
