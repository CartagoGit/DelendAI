import type { IDoctorCommandCheck } from '../doctor';

const PLUGIN_PREFIX = '@delendai/';

const visit = (
	plugin: string,
	graph: ReadonlyMap<string, readonly string[]>,
	visiting: Set<string>,
	visited: Set<string>,
	cycles: Set<string>,
	trail: readonly string[] = [],
): void => {
	if (visited.has(plugin)) return;
	if (visiting.has(plugin)) {
		const cycleStart = trail.indexOf(plugin);
		const cycle = [...trail.slice(cycleStart), plugin].join(' -> ');
		cycles.add(cycle);
		return;
	}
	visiting.add(plugin);
	for (const dependency of graph.get(plugin) ?? []) {
		visit(dependency, graph, visiting, visited, cycles, [...trail, plugin]);
	}
	visiting.delete(plugin);
	visited.add(plugin);
};

export const checkPluginGraph: IDoctorCommandCheck = async ({ fs }) => {
	const plugins = await fs.listDirs('plugins');
	if (plugins.length === 0) {
		return {
			name: 'plugin-graph',
			status: 'warn',
			findings: ['no plugins found under plugins/'],
		};
	}
	const known = new Set(plugins);
	const graph = new Map<string, readonly string[]>();
	const dangling: string[] = [];
	for (const plugin of plugins) {
		const text = await fs.readFile(`plugins/${plugin}/package.json`);
		if (text === undefined) {
			dangling.push(`${plugin} missing package.json`);
			graph.set(plugin, []);
			continue;
		}
		try {
			const pkg = JSON.parse(text) as {
				dependencies?: Record<string, string>;
				devDependencies?: Record<string, string>;
				peerDependencies?: Record<string, string>;
			};
			const localDependencies = [
				...Object.keys(pkg.dependencies ?? {}),
				...Object.keys(pkg.devDependencies ?? {}),
				...Object.keys(pkg.peerDependencies ?? {}),
			]
				.filter((dependency) => dependency.startsWith(PLUGIN_PREFIX))
				.filter((dependency) => dependency !== `${PLUGIN_PREFIX}core`)
				.map((dependency) => dependency.slice(PLUGIN_PREFIX.length));
			const edges = localDependencies.filter((dependency) => {
				if (known.has(dependency)) return true;
				dangling.push(`${plugin} -> ${PLUGIN_PREFIX}${dependency}`);
				return false;
			});
			graph.set(plugin, edges);
		} catch {
			dangling.push(`${plugin} has invalid package.json`);
			graph.set(plugin, []);
		}
	}
	const cycles = new Set<string>();
	const visiting = new Set<string>();
	const visited = new Set<string>();
	for (const plugin of plugins) {
		visit(plugin, graph, visiting, visited, cycles);
	}
	if (dangling.length === 0 && cycles.size === 0) {
		return {
			name: 'plugin-graph',
			status: 'ok',
			findings: [
				`${plugins.length} plugin node(s) form an acyclic local graph`,
			],
		};
	}
	const findings: string[] = [];
	if (dangling.length > 0) {
		findings.push(
			`dangling workspace dependencies: ${dangling.join(', ')}`,
		);
	}
	if (cycles.size > 0) {
		findings.push(`cycle(s) detected: ${[...cycles].join('; ')}`);
	}
	return { name: 'plugin-graph', status: 'warn', findings };
};
