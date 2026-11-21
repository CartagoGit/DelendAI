/**
 * dependency-graph-edges.spec.ts — the states the failure cascade must
 * NOT touch, and the shapes that make a naive traversal loop.
 *
 * The happy paths live in `dependency-graph.spec.ts`. These are the edges
 * that decide whether one plugin failing takes the workspace with it.
 */
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
	initialState?: IDependencyGraphPluginInput['initialState'],
): IDependencyGraphPluginInput => ({
	name,
	specifier: `@delendai/${name}`,
	resolvedSpecifier: `@delendai/${name}`,
	dependsOn,
	...(initialState === undefined ? {} : { initialState }),
});

describe('setDependencyGraphState', () => {
	it('ignores a plugin the graph has never heard of', () => {
		// Returning the graph unchanged, rather than inventing a node,
		// keeps a typo from creating a phantom plugin nothing can run.
		const graph = buildDependencyGraph([plugin('a')]);
		expect(setDependencyGraphState(graph, 'ghost', 'blocked')).toBe(graph);
	});

	it('accumulates blockers, and clears none of them on a non-blocked state', () => {
		const graph = buildDependencyGraph([plugin('a')]);
		const once = setDependencyGraphState(graph, 'a', 'blocked', {
			blockedBy: ['x'],
		});
		const twice = setDependencyGraphState(once, 'a', 'blocked', {
			blockedBy: ['y'],
		});
		expect(twice.nodes.a?.blockedBy).toEqual(['x', 'y']);

		// Moving to another state keeps the record of WHO blocked it: the
		// history is the diagnosis.
		const active = setDependencyGraphState(twice, 'a', 'active');
		expect(active.nodes.a?.blockedBy).toEqual(['x', 'y']);
	});
});

describe('blockDependentsForFailure', () => {
	it('never blocks a dependent that is already running', () => {
		// An active plugin has already done its work; blocking it would
		// take down something that is fine because of something that is
		// not.
		const graph = buildDependencyGraph([
			plugin('base'),
			plugin('user', ['base'], 'active'),
		]);
		const { graph: after, blocked } = blockDependentsForFailure(
			graph,
			'base',
		);
		expect(blocked).toEqual([]);
		expect(after.nodes.user?.state).toBe('active');
	});

	it('never blocks one that already failed or was disposed', () => {
		for (const state of ['failed', 'disposed'] as const) {
			const graph = buildDependencyGraph([
				plugin('base'),
				plugin('user', ['base'], state),
			]);
			const { blocked } = blockDependentsForFailure(graph, 'base');
			expect(blocked, state).toEqual([]);
		}
	});

	it('does not report a dependent that was already blocked', () => {
		// It stays blocked — but reporting it again would tell an operator
		// that a second thing just broke.
		const graph = setDependencyGraphState(
			buildDependencyGraph([plugin('base'), plugin('user', ['base'])]),
			'user',
			'blocked',
			{ blockedBy: ['something-else'] },
		);
		const { graph: after, blocked } = blockDependentsForFailure(
			graph,
			'base',
		);
		expect(blocked).toEqual([]);
		expect(after.nodes.user?.blockedBy).toEqual(['something-else', 'base']);
	});

	it('visits a diamond once, instead of walking it twice', () => {
		//        base
		//        /   \
		//    left     right
		//        \   /
		//         join
		const graph = buildDependencyGraph([
			plugin('base'),
			plugin('left', ['base']),
			plugin('right', ['base']),
			plugin('join', ['left', 'right']),
		]);
		const { blocked } = blockDependentsForFailure(graph, 'base');
		expect(blocked.map((node) => node.name).sort()).toEqual([
			'join',
			'left',
			'right',
		]);
		// `join` reported once, not once per path that reaches it.
		expect(blocked.filter((node) => node.name === 'join')).toHaveLength(1);
	});

	it('records the IMMEDIATE blocker at each hop, not the original failure', () => {
		// "blocked by base" three levels down tells an operator nothing
		// about where to look.
		const graph = buildDependencyGraph([
			plugin('base'),
			plugin('mid', ['base']),
			plugin('leaf', ['mid']),
		]);
		const { graph: after } = blockDependentsForFailure(graph, 'base');
		expect(after.nodes.mid?.blockedBy).toEqual(['base']);
		expect(after.nodes.leaf?.blockedBy).toEqual(['mid']);
	});
});

describe('buildDependencyGraph edges', () => {
	it('honours an initial state instead of assuming everything starts fresh', () => {
		const graph = buildDependencyGraph([plugin('a', [], 'active')]);
		expect(graph.nodes.a?.state).toBe('active');
	});

	it('orders a node’s dependents by input order, not by discovery order', () => {
		// Two runs of the same workspace must produce the same order, or
		// anything derived from it disagrees between agents.
		const graph = buildDependencyGraph([
			plugin('base'),
			plugin('second', ['base']),
			plugin('third', ['base']),
		]);
		expect(graph.nodes.base?.dependents).toEqual(['second', 'third']);
	});

	it('does not let a missing dependency stall the plugins that are present', () => {
		// The edge points at nothing, so it must not count toward the
		// indegree — otherwise one absent plugin silently prevents every
		// dependent from ever being ordered.
		const graph = buildDependencyGraph([
			plugin('present', ['absent']),
			plugin('other'),
		]);
		expect(graph.order).toContain('present');
		expect(graph.missingDependencies).toEqual([
			{ plugin: 'present', missing: ['absent'] },
		]);
		expect(graph.cycle).toBeUndefined();
	});
});
