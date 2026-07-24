import { describe, expect, it } from 'vitest';

import {
	buildDependencyGraph,
	renderMermaid,
} from '../../../src/lib/graph/build-graph';
import type { IWorkspacePackage } from '../../../src/lib/contracts/interfaces/graph.interface';

const packages: IWorkspacePackage[] = [
	{ name: '@scope/core', dependencies: ['zod'] },
	{ name: '@scope/deps', dependencies: ['@scope/core', 'zod'] },
	{ name: '@scope/security', dependencies: ['@scope/core', '@scope/deps'] },
	{ name: '@scope/lonely', dependencies: ['left-pad'] },
];

describe('buildDependencyGraph', () => {
	it('keeps only internal edges and ignores external deps', () => {
		const graph = buildDependencyGraph(packages);
		expect(graph.nodes).toEqual(['core', 'deps', 'lonely', 'security']);
		expect(graph.edges).toEqual([
			{ from: 'deps', to: 'core' },
			{ from: 'security', to: 'core' },
			{ from: 'security', to: 'deps' },
		]);
	});

	it('never draws a self-edge', () => {
		const graph = buildDependencyGraph([
			{ name: '@scope/a', dependencies: ['@scope/a'] },
		]);
		expect(graph.edges).toEqual([]);
	});
});

describe('renderMermaid', () => {
	it('renders a flowchart with edges and declares isolated nodes', () => {
		const mermaid = renderMermaid(buildDependencyGraph(packages));
		expect(mermaid.startsWith('flowchart LR')).toBe(true);
		expect(mermaid).toContain('security["security"] --> deps["deps"]');
		// the lonely package (no internal edges) is still declared
		expect(mermaid).toContain('lonely["lonely"]');
	});
});
