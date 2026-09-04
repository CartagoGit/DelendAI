import { describe, expect, it } from 'vitest';

import {
	blockDependentsForFailure,
	buildDependencyGraph,
	setDependencyGraphState,
} from '@delendai/core/lib/plugins/dependency-graph.service';
import type { IDependencyGraphPluginInput } from '@delendai/core/lib/contracts/interfaces/dependency-graph.interface';

const plugin = (
	name: string,
	dependsOn: readonly string[] = [],
): IDependencyGraphPluginInput => ({
	name,
	specifier: `@delendai/${name}`,
	resolvedSpecifier: `@delendai/${name}`,
	dependsOn,
});

describe('buildDependencyGraph (t00015 LIFE-001 primitives)', () => {
	it('produces a topological order that respects every dependency edge', () => {
		const graph = buildDependencyGraph([
			plugin('c', ['a', 'b']),
			plugin('a', ['b']),
			plugin('b'),
		]);

		expect(graph.cycle).toBeUndefined();
		expect(graph.order).toEqual(['b', 'a', 'c']);
		const bIndex = graph.order.indexOf('b');
		const aIndex = graph.order.indexOf('a');
		const cIndex = graph.order.indexOf('c');
		expect(bIndex).toBeLessThan(aIndex);
		expect(aIndex).toBeLessThan(cIndex);
	});

	it('exposes dependents and dependsOn as reverse-views of the same edge', () => {
		const graph = buildDependencyGraph([
			plugin('a', ['b']),
			plugin('b', ['c']),
			plugin('c'),
		]);

		expect(graph.nodes.a?.dependsOn).toEqual(['b']);
		expect(graph.nodes.a?.dependents).toEqual([]);
		expect(graph.nodes.b?.dependsOn).toEqual(['c']);
		expect(graph.nodes.b?.dependents).toEqual(['a']);
		expect(graph.nodes.c?.dependsOn).toEqual([]);
		expect(graph.nodes.c?.dependents).toEqual(['b']);
	});

	it('reports a missing dependency without crashing (no cycle path)', () => {
		// `a` is a self-contained plugin; `b` declares `ghost` which is NOT
		// in the resolved set. Only `b` has a missing dependency — `a` does
		// not, because there is no reference to `ghost` from `a`. The
		// primitive must surface the missing reference so the lifecycle
		// helper can mark `b` as `blocked`; it does NOT block the node
		// itself (that happens downstream in
		// `registerResolvedPluginsWithLifecycle`).
		const graph = buildDependencyGraph([
			plugin('a'),
			plugin('b', ['ghost']),
		]);

		expect(graph.cycle).toBeUndefined();
		expect(graph.missingDependencies).toEqual([
			{ plugin: 'b', missing: ['ghost'] },
		]);
		// Both nodes appear in the graph and in the topological order —
		// the order is the topological walk, NOT a "runnable" list. The
		// runner filters by `node.state` afterwards.
		expect(Object.keys(graph.nodes).sort()).toEqual(['a', 'b']);
		expect(graph.order).toEqual(['a', 'b']);
		expect(graph.nodes.a?.state).toBe('validated');
		expect(graph.nodes.b?.state).toBe('validated');
	});

	it('detects a dependency cycle and reports the path that closes it', () => {
		const graph = buildDependencyGraph([
			plugin('a', ['b']),
			plugin('b', ['c']),
			plugin('c', ['a']),
		]);

		expect(graph.cycle).toBeDefined();
		expect(graph.cycle?.plugins).toEqual(['a', 'b', 'c']);
		expect(graph.cycle?.path.at(-1)).toBe(graph.cycle?.path[0]);
		expect(graph.order).toEqual([]);
	});

	it('marks a node `blocked` when setDependencyGraphState is called', () => {
		const initial = buildDependencyGraph([plugin('a', ['b']), plugin('b')]);

		const blocked = setDependencyGraphState(initial, 'a', 'blocked', {
			blockedBy: ['b'],
		});

		expect(blocked.nodes.a?.state).toBe('blocked');
		expect(blocked.nodes.a?.blockedBy).toEqual(['b']);
		// The base graph is untouched (immutable update).
		expect(initial.nodes.a?.state).toBe('validated');
	});

	it('blockDependentsForFailure propagates `blocked` transitively, recording the IMMEDIATE blocker', () => {
		const initial = buildDependencyGraph([
			plugin('a'),
			plugin('b', ['a']),
			plugin('c', ['b']),
			plugin('d'),
		]);

		const { graph, blocked } = blockDependentsForFailure(initial, 'a');
		expect(blocked.map((entry) => entry.name).sort()).toEqual(['b', 'c']);
		// `b` is a direct dependent of `a` — its immediate blocker is `a`.
		expect(graph.nodes.b?.state).toBe('blocked');
		expect(graph.nodes.b?.blockedBy).toEqual(['a']);
		// `c` is a transitive dependent via `b` — its immediate blocker is
		// `b`, NOT the root cause `a`. This is the spec the runner relies
		// on: each blocked entry points at the nearest reason it cannot
		// become active.
		expect(graph.nodes.c?.state).toBe('blocked');
		expect(graph.nodes.c?.blockedBy).toEqual(['b']);
		// `d` is independent of `a` and stays validated.
		expect(graph.nodes.d?.state).toBe('validated');
	});

	it('blockDependentsForFailure is a no-op for an unknown plugin name', () => {
		const initial = buildDependencyGraph([plugin('a')]);
		const { graph, blocked } = blockDependentsForFailure(initial, 'ghost');
		expect(blocked).toEqual([]);
		expect(graph).toBe(initial);
	});
});
