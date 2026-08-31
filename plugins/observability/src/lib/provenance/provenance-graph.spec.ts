import { describe, expect, it } from 'vitest';

import { buildProvenanceGraph, PROVENANCE_NODE_KINDS } from './index';

const FIRST_PULL_REQUEST = 92;
const SECOND_PULL_REQUEST = '5'.concat('2');

describe('buildProvenanceGraph', () => {
	it('links every canonical provenance kind without leaking discarded user data', () => {
		const graph = buildProvenanceGraph({
			agent: 'Finch <finch@example.com>',
			proposalId: 'f00392',
			sliceId: 'S2',
			toolIds: ['obs_errors'],
			testPaths: [
				'/home/finch/private/plugins/observability/src/lib/errors/list-errors.spec.ts',
			],
			commitShas: ['8514f99deadbeef'],
			releaseTags: ['release/patch/provenance-truth'],
			pullRequests: [FIRST_PULL_REQUEST],
			userData: ['secret-token', 'finch@example.com'],
		});

		expect(graph.nodes.map((node) => node.kind)).toEqual(
			expect.arrayContaining([...PROVENANCE_NODE_KINDS]),
		);
		expect(graph.redactions).toBeGreaterThanOrEqual(3);
		expect(graph.ignoredUserDataCount).toBe(2);

		const serialized = JSON.stringify(graph);
		expect(serialized).not.toContain('secret-token');
		expect(serialized).not.toContain('finch@example.com');
		expect(serialized).not.toContain('/home/finch/private');
	});

	it('builds deterministic internal and external links when explicit mappings are provided', () => {
		const graph = buildProvenanceGraph(
			{
				agent: 'finch',
				proposalId: 'f00392',
				sliceId: 'S2',
				toolIds: ['obs_errors'],
				testPaths: [
					'plugins/observability/src/lib/errors/list-errors.spec.ts',
				],
				commitShas: ['8514f99'],
				releaseTags: ['v0.1.1'],
				pullRequests: [SECOND_PULL_REQUEST],
			},
			{
				repoUrl: 'https://github.com/CartagoGit/mcp-vertex',
				proposalPaths: {
					f00392: 'docs/mcp-vertex/proposals/ready/feats/f00392-adaptive-preferred-path-proposals-facade-provenance-generated-truth-and-vs-code-benchmark.md',
				},
				toolPaths: {
					obs_errors:
						'plugins/observability/src/lib/tools/obs-errors.tool.ts',
				},
				testPaths: {
					'plugins/observability/src/lib/errors/list-errors.spec.ts':
						'plugins/observability/src/lib/errors/list-errors.spec.ts',
				},
			},
		);

		const hrefById = Object.fromEntries(
			graph.nodes.map((node) => [node.id, node.href]),
		);
		expect(hrefById['proposal:f00392']).toBe(
			'docs/mcp-vertex/proposals/ready/feats/f00392-adaptive-preferred-path-proposals-facade-provenance-generated-truth-and-vs-code-benchmark.md',
		);
		expect(hrefById['slice:S2']).toBe(
			'docs/mcp-vertex/proposals/ready/feats/f00392-adaptive-preferred-path-proposals-facade-provenance-generated-truth-and-vs-code-benchmark.md#slices',
		);
		expect(hrefById['tool:obs_errors']).toBe(
			'plugins/observability/src/lib/tools/obs-errors.tool.ts',
		);
		expect(
			hrefById[
				'test:plugins/observability/src/lib/errors/list-errors.spec.ts'
			],
		).toBe('plugins/observability/src/lib/errors/list-errors.spec.ts');
		expect(hrefById['commit:8514f99']).toBe(
			'https://github.com/CartagoGit/mcp-vertex/commit/8514f99',
		);
		expect(hrefById['release:v0.1.1']).toBe(
			'https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.1.1',
		);
		expect(hrefById[`pr:${SECOND_PULL_REQUEST}`]).toBe(
			`https://github.com/CartagoGit/mcp-vertex/pull/${SECOND_PULL_REQUEST}`,
		);
	});
});
