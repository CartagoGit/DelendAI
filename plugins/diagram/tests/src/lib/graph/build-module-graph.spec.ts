/**
 * build-module-graph.spec.ts — f00132 S1 acceptance for the pure
 * module-graph builder + renderer. Tests run without a filesystem:
 * the I/O layer is replaced with a static map and the builder is
 * exercised end-to-end.
 */

import { describe, expect, it } from 'vitest';

import {
	buildModuleGraph,
	limitModuleGraph,
	moduleDisplayName,
	renderModuleMermaid,
} from '../../../../src/lib/graph/build-module-graph';

describe('buildModuleGraph + renderModuleMermaid (f00132 S1)', () => {
	it('moduleDisplayName strips the .ts extension and leading ./', () => {
		expect(moduleDisplayName('./src/lib/foo.ts')).toBe('src/lib/foo');
		expect(moduleDisplayName('src/lib/bar.tsx')).toBe('src/lib/bar');
		expect(moduleDisplayName('src/lib/baz')).toBe('src/lib/baz');
	});

	it('builds a graph from a Record and drops self-loops', () => {
		const graph = buildModuleGraph({
			'src/lib/a.ts': ['src/lib/b.ts', 'src/lib/a.ts'],
			'src/lib/b.ts': ['src/lib/c.ts'],
		});
		expect(graph.nodes).toEqual(['src/lib/a', 'src/lib/b', 'src/lib/c']);
		expect(graph.edges).toEqual([
			{ from: 'src/lib/a', to: 'src/lib/b' },
			{ from: 'src/lib/b', to: 'src/lib/c' },
		]);
	});

	it('builds a graph from a ReadonlyMap (parity with Record)', () => {
		const map = new Map<string, readonly string[]>([
			['src/a.ts', ['src/b.ts']],
			['src/b.ts', []],
		]);
		const graph = buildModuleGraph(map);
		expect(graph.nodes).toEqual(['src/a', 'src/b']);
		expect(graph.edges).toEqual([{ from: 'src/a', to: 'src/b' }]);
	});

	it('renders a deterministic mermaid flowchart', () => {
		const graph = buildModuleGraph({
			'src/lib/foo.ts': ['src/lib/bar.ts'],
			'src/lib/bar.ts': [],
		});
		const mermaid = renderModuleMermaid(graph);
		expect(mermaid).toContain('flowchart LR');
		expect(mermaid).toMatch(/src_lib_foo.*-->.*src_lib_bar/);
	});

	it('declares isolated nodes (no edges) so they still appear', () => {
		const graph = buildModuleGraph({
			'src/connected.ts': ['src/other.ts'],
			'src/isolated.ts': [],
		});
		const mermaid = renderModuleMermaid(graph);
		expect(mermaid).toMatch(/src_connected/);
		expect(mermaid).toMatch(/src_other/);
		expect(mermaid).toMatch(/src_isolated/);
	});

	it('output is byte-identical across calls (determinism)', () => {
		const graph = buildModuleGraph({
			'src/a.ts': ['src/b.ts', 'src/c.ts'],
			'src/b.ts': ['src/c.ts'],
			'src/c.ts': [],
		});
		const first = renderModuleMermaid(graph);
		const second = renderModuleMermaid(graph);
		expect(first).toBe(second);
	});

	it('handles an empty input without throwing', () => {
		const graph = buildModuleGraph({});
		expect(graph.nodes).toEqual([]);
		expect(graph.edges).toEqual([]);
		expect(renderModuleMermaid(graph)).toBe('flowchart LR');
	});

	it('limits deterministically by the first sorted node ids', () => {
		const limited = limitModuleGraph(
			buildModuleGraph({
				'src/c.ts': [],
				'src/a.ts': ['src/b.ts'],
				'src/b.ts': ['src/c.ts'],
			}),
			2,
		);
		expect(limited.graph.nodes).toEqual(['src/a', 'src/b']);
		expect(limited.graph.edges).toEqual([{ from: 'src/a', to: 'src/b' }]);
		expect(limited.truncated).toBe(true);
	});
});
