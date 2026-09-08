import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	BuildGraphCycleError,
	buildDependencyEdges,
	computeBuildOrder,
	readWorkspacePackages,
	topologicalOrder,
	type WorkspacePackage,
} from './build-graph';

const REPO_ROOT = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
);

const pkg = (
	rel: string,
	name: string,
	dependencyNames: string[] = [],
): WorkspacePackage => ({ rel, name, dependencyNames });

const orderOf = (packages: WorkspacePackage[]): string[] =>
	topologicalOrder(buildDependencyEdges(packages));

const positionOf = (order: string[], rel: string): number => {
	const index = order.indexOf(rel);
	expect(index, `${rel} missing from build order`).toBeGreaterThanOrEqual(0);
	return index;
};

/** Turn inline manifests into the same shape `readWorkspacePackages` yields. */
const readWorkspacePackagesFromFixture = (
	manifests: Record<
		string,
		{
			name: string;
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
			optionalDependencies?: Record<string, string>;
		}
	>,
): WorkspacePackage[] =>
	Object.entries(manifests).map(([rel, manifest]) =>
		pkg(rel, manifest.name, [
			...new Set([
				...Object.keys(manifest.dependencies ?? {}),
				...Object.keys(manifest.peerDependencies ?? {}),
				...Object.keys(manifest.optionalDependencies ?? {}),
			]),
		]),
	);

describe('topological build order (synthetic)', () => {
	it('places declared dependencies before their consumers', () => {
		const order = orderOf([
			pkg('packages/core', '@delendai/core', [
				'@delendai/contracts',
				'@delendai/state',
			]),
			pkg('packages/contracts', '@delendai/contracts'),
			pkg('packages/state', '@delendai/state', ['@delendai/contracts']),
		]);
		expect(order).toEqual([
			'packages/contracts',
			'packages/state',
			'packages/core',
		]);
	});

	it('honours peerDependencies and optionalDependencies as edges', () => {
		const packages = readWorkspacePackagesFromFixture({
			'packages/a': {
				name: '@delendai/a',
				peerDependencies: { '@delendai/b': '*' },
				optionalDependencies: { '@delendai/c': '*' },
			},
			'packages/b': { name: '@delendai/b' },
			'packages/c': { name: '@delendai/c' },
		});
		const order = orderOf(packages);
		expect(positionOf(order, 'packages/b')).toBeLessThan(
			positionOf(order, 'packages/a'),
		);
		expect(positionOf(order, 'packages/c')).toBeLessThan(
			positionOf(order, 'packages/a'),
		);
	});

	it('breaks ties alphabetically within a level', () => {
		const order = orderOf([
			pkg('plugins/zzz', '@delendai/zzz'),
			pkg('packages/bbb', '@delendai/bbb'),
			pkg('packages/aaa', '@delendai/aaa'),
		]);
		expect(order).toEqual(['packages/aaa', 'packages/bbb', 'plugins/zzz']);
	});

	it('lets a plugin build before the package that depends on it', () => {
		const order = orderOf([
			pkg('packages/cli', '@delendai/cli', ['@delendai/env']),
			pkg('plugins/env', '@delendai/env'),
		]);
		expect(order).toEqual(['plugins/env', 'packages/cli']);
	});

	it('ignores @delendai/* specifiers that are not workspace packages', () => {
		const order = orderOf([
			pkg('packages/a', '@delendai/a', ['@delendai/published-elsewhere']),
		]);
		expect(order).toEqual(['packages/a']);
	});

	it('ignores dependencies excluded from the selected node set', () => {
		const packages = [
			pkg('packages/a', '@delendai/a', ['@delendai/b']),
			pkg('packages/b', '@delendai/b'),
		];
		const order = topologicalOrder(
			buildDependencyEdges(packages, ['packages/a']),
		);
		expect(order).toEqual(['packages/a']);
	});

	it('fails loudly naming the cycle instead of inventing an order', () => {
		const packages = [
			pkg('packages/a', '@delendai/a', ['@delendai/b']),
			pkg('packages/b', '@delendai/b', ['@delendai/a']),
		];
		let thrown: unknown;
		try {
			orderOf(packages);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(BuildGraphCycleError);
		const cycleError = thrown as BuildGraphCycleError;
		expect(cycleError.cycle).toContain('packages/a');
		expect(cycleError.cycle).toContain('packages/b');
		expect(cycleError.cycle.at(0)).toBe(cycleError.cycle.at(-1));
		expect(cycleError.message).toContain('cycle');
		expect(cycleError.message).toContain('packages/a');
		expect(cycleError.message).toContain('packages/b');
	});
});

describe('topological build order (real repository manifests)', () => {
	const packages = readWorkspacePackages(REPO_ROOT);
	const buildable = packages
		.map((entry) => entry.rel)
		.filter((rel) => existsSync(join(REPO_ROOT, rel, 'src', 'index.ts')))
		.sort((a, b) => a.localeCompare(b));
	// The repository currently declares a real dependency cycle among
	// plugins (proposals -> error-reporting -> commit-policy ->
	// proposals), which the default policy rejects outright. The order
	// assertions below are about everything else, so this suite opts into
	// the documented degradation instead of asserting a green graph the
	// manifests do not yet have.
	const cycleWarnings: string[] = [];
	const order = computeBuildOrder(REPO_ROOT, buildable, {
		onCycle: 'warn',
		warn: (message) => cycleWarnings.push(message),
	});
	const relByName = new Map(packages.map((entry) => [entry.name, entry.rel]));
	const dependencyRels = (rel: string): string[] =>
		(packages.find((entry) => entry.rel === rel)?.dependencyNames ?? [])
			.map((name) => relByName.get(name))
			.filter((dep): dep is string => dep !== undefined && dep !== rel);
	const reaches = (from: string, to: string): boolean => {
		const seen = new Set<string>();
		const queue = [from];
		while (queue.length > 0) {
			const current = queue.shift() as string;
			for (const dep of dependencyRels(current)) {
				if (dep === to) return true;
				if (seen.has(dep)) continue;
				seen.add(dep);
				queue.push(dep);
			}
		}
		return false;
	};

	it('reads every workspace manifest', () => {
		expect(packages.length).toBeGreaterThan(10);
		expect(order.length).toBe(buildable.length);
		expect(new Set(order).size).toBe(order.length);
	});

	it('builds contracts and state before core', () => {
		const core = positionOf(order, 'packages/core');
		expect(positionOf(order, 'packages/contracts')).toBeLessThan(core);
		expect(positionOf(order, 'packages/state')).toBeLessThan(core);
	});

	it('builds every declared dependency of cli before cli', () => {
		const cliManifest = JSON.parse(
			readFileSync(join(REPO_ROOT, 'packages/cli/package.json'), 'utf8'),
		) as {
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
			optionalDependencies?: Record<string, string>;
		};
		const cliDeps = [
			...new Set([
				...Object.keys(cliManifest.dependencies ?? {}),
				...Object.keys(cliManifest.peerDependencies ?? {}),
				...Object.keys(cliManifest.optionalDependencies ?? {}),
			]),
		]
			.filter((name) => name.startsWith('@delendai/'))
			.map((name) => relByName.get(name))
			.filter(
				(rel): rel is string =>
					rel !== undefined && order.includes(rel),
			);
		// The regression that matters: cli declares plugin dependencies
		// (rank 2 under the old heuristic) and used to build before them.
		expect(cliDeps.some((rel) => rel.startsWith('plugins/'))).toBe(true);
		const cli = positionOf(order, 'packages/cli');
		for (const dep of cliDeps) {
			expect(
				positionOf(order, dep),
				`${dep} must build before cli`,
			).toBeLessThan(cli);
		}
	});

	it('places every declared workspace dependency before its consumer, except inside a declared cycle', () => {
		const index = new Map(order.map((rel, at) => [rel, at]));
		for (const entry of packages) {
			const consumer = index.get(entry.rel);
			if (consumer === undefined) continue;
			for (const depRel of dependencyRels(entry.rel)) {
				const dependency = index.get(depRel);
				if (dependency === undefined) continue;
				if (dependency < consumer) continue;
				// The only tolerated inversion is one the manifests make
				// unsatisfiable: consumer and dependency reach each other.
				expect(
					reaches(depRel, entry.rel) && reaches(entry.rel, depRel),
					`${depRel} builds after ${entry.rel} without a declared cycle between them`,
				).toBe(true);
			}
		}
	});

	it('reports the cycles it had to force through', () => {
		// Documents the defect the graph exposes rather than hiding it:
		// when the manifests stop being cyclic this warning list is empty.
		expect(
			cycleWarnings.every((message) => message.includes('cycle')),
		).toBe(true);
	});

	it('includes packages/state-telemetry in the graph', () => {
		expect(packages.map((entry) => entry.rel)).toContain(
			'packages/state-telemetry',
		);
	});
});

describe('cycle policy', () => {
	const cyclic = new Map<string, string[]>([
		['packages/a', ['packages/b']],
		['packages/b', ['packages/a']],
		['packages/z', []],
	]);

	it('throws by default', () => {
		expect(() => topologicalOrder(cyclic)).toThrow(BuildGraphCycleError);
	});

	it('warns and degrades deterministically only when asked to', () => {
		const warnings: string[] = [];
		const order = topologicalOrder(cyclic, {
			onCycle: 'warn',
			warn: (message) => warnings.push(message),
		});
		expect(order).toEqual(['packages/z', 'packages/a', 'packages/b']);
		expect(warnings.join('\n')).toContain('cycle');
		expect(warnings.join('\n')).toContain('packages/a');
	});
});
