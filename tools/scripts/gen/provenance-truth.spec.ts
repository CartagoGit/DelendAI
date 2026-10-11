import { describe, expect, it } from 'vitest';

import plugin from '../../../plugins/observability/src/index';
import {
	buildProvenanceGraph,
	PROVENANCE_NODE_KINDS,
	PROVENANCE_RELATION_DEFINITIONS,
} from '../../../plugins/observability/src/public';
import {
	buildProvenanceTruthSnapshot,
	listObservabilityValidationTestPaths,
	renderProvenanceTruthMarkdown,
	run,
} from './provenance-truth.script';

const createPluginContext = () =>
	({
		namespacePrefix: 'obs',
		options: {},
		cacheDir: '.cache/delendai',
		pluginCacheDir: '.cache/delendai/observability',
		pluginDocsDir: 'docs/plugins/observability',
		workspace: {
			root: '/workspace',
			resolve: (path: string) => `/workspace/${path}`,
		},
		corePaths: {
			cacheDir: '.cache/delendai',
			docsDir: 'docs/delendai',
		},
		keepLegacy: false,
		agentWorktreeEnabled: false,
		commitAuthor: {
			mode: 'workspace-config',
			identity: 'Copilot',
			named: 'Copilot',
		},
		args: [],
		cacheEvictionRegistry: {
			register: () => undefined,
		},
		peerPlugins: {},
	}) as never;

describe('provenance-truth.script.ts', () => {
	it('keeps the provenance public contract importable from source in a clean checkout', () => {
		expect(buildProvenanceGraph).toBeTypeOf('function');
		expect(PROVENANCE_NODE_KINDS).toContain('agent');
		expect(PROVENANCE_RELATION_DEFINITIONS).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					from: 'proposal',
					relation: 'contains',
					to: 'slice',
				}),
			]),
		);
	});

	it('renders generated truth from the provenance source-of-truth contract', () => {
		const snapshot = buildProvenanceTruthSnapshot();
		const markdown = renderProvenanceTruthMarkdown(snapshot);

		expect(markdown).toContain('# Observability provenance truth');
		expect(markdown).toContain('Plugin id: observability');
		expect(markdown).toContain('- Registered tools: 4');
		expect(markdown).toContain('| obs_health |');
		expect(markdown).toContain('| agent | public provenance contract |');
		expect(markdown).toContain('| proposal | contains | slice |');
		expect(markdown).toContain('| slice | uses | tool |');
		expect(markdown).toContain(
			'[f00392 / S2](../proposals/ready/feats/f00392-adaptive-preferred-path-proposals-facade-provenance-generated-truth-and-vs-code-benchmark.md#slices)',
		);
		expect(markdown).toContain(
			'[plugins/observability/src/lib/tools/obs-health.tool.ts](../../../plugins/observability/src/lib/tools/obs-health.tool.ts)',
		);
		expect(markdown).toContain(
			'[plugins/observability/src/lib/tools/obs-errors.tool.ts](../../../plugins/observability/src/lib/tools/obs-errors.tool.ts)',
		);
		expect(markdown).toContain(
			'[plugins/observability/src/lib/provenance/provenance-graph.spec.ts](../../../plugins/observability/src/lib/provenance/provenance-graph.spec.ts)',
		);
		expect(markdown).not.toContain('finch@example.com');
		expect(markdown).not.toContain('secret-token');
	});

	it('fails when the snapshot diverges from the real plugin registration or test inventory', async () => {
		const registrations = await plugin.register(createPluginContext());
		const snapshot = buildProvenanceTruthSnapshot();

		expect(snapshot.registrations.toolIds).toEqual(
			(registrations.tools ?? []).map((tool) => tool.id),
		);
		expect(snapshot.registrations.testPaths).toEqual(
			listObservabilityValidationTestPaths(),
		);
		expect(snapshot.exampleGraph.nodes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'tool:obs_health' }),
			]),
		);
	});

	it('returns 1 in --check mode when the generated doc drifts', async () => {
		const exit = await run({
			argv: ['--check'],
			outputPath:
				'docs/delendai/generated/observability-provenance.generated.md',
			readText: async () => '# stale\n',
			writeText: async () => undefined,
		});

		expect(exit).toBe(1);
	});

	it('returns 0 in --check mode when the generated doc is current', async () => {
		const current = renderProvenanceTruthMarkdown(
			buildProvenanceTruthSnapshot(),
		);
		const exit = await run({
			argv: ['--check'],
			outputPath:
				'docs/delendai/generated/observability-provenance.generated.md',
			readText: async () => current,
			writeText: async () => undefined,
		});

		expect(exit).toBe(0);
	});
});
