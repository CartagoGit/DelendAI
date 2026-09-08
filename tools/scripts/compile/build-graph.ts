/**
 * Build-order graph (x00531 S1).
 *
 * The compile order of the monorepo is DERIVED from the dependency graph
 * the manifests already declare — `dependencies`, `peerDependencies` and
 * `optionalDependencies` of every `packages/*` and `plugins/*` workspace,
 * restricted to `@delendai/*` specifiers that actually resolve to a
 * workspace directory — and then topologically sorted.
 *
 * It replaces the previous `buildRank()` heuristic (`packages/core` → 0,
 * any other `packages/*` → 1, `plugins/*` → 2, alphabetical tiebreak),
 * which contradicted the declared dependencies in at least three places:
 * `packages/core` depends on `@delendai/contracts` and `@delendai/state`
 * (both rank 1, so core built BEFORE them), `packages/context-compiler`
 * depends on `@delendai/state` and beat it alphabetically, and
 * `packages/cli` depends on plugins (rank 2). Pre-existing `dist/` trees
 * masked the inversion on incremental builds; a clean checkout did not.
 *
 * No package name is hardcoded here: the order is a pure function of the
 * manifests. A dependency cycle is a hard failure that names the cycle,
 * never an arbitrary order.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Manifest sections that constrain build order. */
export const DEPENDENCY_SECTIONS = [
	'dependencies',
	'peerDependencies',
	'optionalDependencies',
] as const;

/** Workspace groups scanned for buildable packages. */
export const WORKSPACE_GROUPS = ['packages', 'plugins'] as const;

export interface WorkspacePackage {
	/** Repo-relative directory, e.g. `packages/core`. */
	readonly rel: string;
	/** Declared package name, e.g. `@delendai/core`. */
	readonly name: string;
	/** Declared `@delendai/*` dependency names (all sections, deduped). */
	readonly dependencyNames: readonly string[];
}

/** Thrown when the declared dependency graph contains a cycle. */
export class BuildGraphCycleError extends Error {
	constructor(readonly cycle: readonly string[]) {
		super(`build order: dependency cycle detected: ${cycle.join(' -> ')}`);
		this.name = 'BuildGraphCycleError';
	}
}

interface RawManifest {
	name?: unknown;
	dependencies?: Record<string, unknown>;
	peerDependencies?: Record<string, unknown>;
	optionalDependencies?: Record<string, unknown>;
}

const readManifest = (path: string): RawManifest =>
	JSON.parse(readFileSync(path, 'utf8')) as RawManifest;

/**
 * Every workspace directory that carries a `package.json` with a name,
 * regardless of whether it is buildable. Used to resolve `@delendai/*`
 * specifiers to a workspace, so a dependency on a non-buildable
 * workspace is recognised (and then simply carries no edge).
 */
export const readWorkspacePackages = (root: string): WorkspacePackage[] => {
	const packages: WorkspacePackage[] = [];
	for (const group of WORKSPACE_GROUPS) {
		const groupDir = join(root, group);
		if (!existsSync(groupDir)) continue;
		for (const entry of readdirSync(groupDir).sort()) {
			const rel = `${group}/${entry}`;
			const manifestPath = join(root, rel, 'package.json');
			if (!existsSync(manifestPath)) continue;
			const manifest = readManifest(manifestPath);
			if (typeof manifest.name !== 'string') continue;
			const dependencyNames = new Set<string>();
			for (const section of DEPENDENCY_SECTIONS) {
				for (const dep of Object.keys(manifest[section] ?? {})) {
					if (!dep.startsWith('@delendai/')) continue;
					if (dep === manifest.name) continue;
					dependencyNames.add(dep);
				}
			}
			packages.push({
				rel,
				name: manifest.name,
				dependencyNames: [...dependencyNames].sort(),
			});
		}
	}
	return packages;
};

/** Edges (`rel` → its `rel` dependencies) restricted to `selected`. */
export const buildDependencyEdges = (
	packages: readonly WorkspacePackage[],
	selected: readonly string[] = packages.map((pkg) => pkg.rel),
): Map<string, string[]> => {
	const relByName = new Map(packages.map((pkg) => [pkg.name, pkg.rel]));
	const included = new Set(selected);
	const edges = new Map<string, string[]>();
	for (const rel of [...included].sort()) edges.set(rel, []);
	for (const pkg of packages) {
		if (!included.has(pkg.rel)) continue;
		const deps: string[] = [];
		for (const depName of pkg.dependencyNames) {
			const depRel = relByName.get(depName);
			// Not a workspace package (external `@delendai/*` on the
			// registry), not buildable, or self: no ordering constraint.
			if (depRel === undefined || depRel === pkg.rel) continue;
			if (!included.has(depRel)) continue;
			deps.push(depRel);
		}
		edges.set(pkg.rel, [...new Set(deps)].sort());
	}
	return edges;
};

/** Depth-first walk that returns the first cycle it can name. */
export const findCycle = (edges: Map<string, string[]>): string[] => {
	const state = new Map<string, 'visiting' | 'done'>();
	const stack: string[] = [];
	const walk = (node: string): string[] | undefined => {
		const current = state.get(node);
		if (current === 'done') return undefined;
		if (current === 'visiting') {
			const start = stack.indexOf(node);
			return [...stack.slice(start), node];
		}
		state.set(node, 'visiting');
		stack.push(node);
		for (const dep of edges.get(node) ?? []) {
			const cycle = walk(dep);
			if (cycle !== undefined) return cycle;
		}
		stack.pop();
		state.set(node, 'done');
		return undefined;
	};
	for (const node of [...edges.keys()].sort()) {
		const cycle = walk(node);
		if (cycle !== undefined) return cycle;
	}
	return [];
};

/**
 * Deterministic topological sort: dependencies first, alphabetical
 * tiebreak within each level (all nodes whose dependencies are already
 * emitted form one level and are emitted in alphabetical order).
 *
 * @throws BuildGraphCycleError naming the cycle when one exists.
 */
export const topologicalOrder = (edges: Map<string, string[]>): string[] => {
	const remaining = new Map<string, Set<string>>();
	for (const [node, deps] of edges) remaining.set(node, new Set(deps));
	const order: string[] = [];
	const emitted = new Set<string>();
	while (remaining.size > 0) {
		const level = [...remaining.entries()]
			.filter(([, deps]) => [...deps].every((dep) => emitted.has(dep)))
			.map(([node]) => node)
			.sort((a, b) => a.localeCompare(b));
		if (level.length === 0) {
			const stuck = new Map(
				[...remaining].map(([node, deps]) => [
					node,
					[...deps].filter((dep) => remaining.has(dep)).sort(),
				]),
			);
			const cycle = findCycle(stuck);
			throw new BuildGraphCycleError(cycle);
		}
		for (const node of level) {
			order.push(node);
			emitted.add(node);
			remaining.delete(node);
		}
	}
	return order;
};

/**
 * Build order for `selected` workspace directories, derived from the
 * manifests under `root`.
 */
export const computeBuildOrder = (
	root: string,
	selected?: readonly string[],
): string[] => {
	const packages = readWorkspacePackages(root);
	const nodes =
		selected ??
		packages.map((pkg) => pkg.rel).sort((a, b) => a.localeCompare(b));
	return topologicalOrder(buildDependencyEdges(packages, nodes));
};
