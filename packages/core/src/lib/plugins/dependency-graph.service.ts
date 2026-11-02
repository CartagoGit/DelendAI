import type {
	IBlockDependentsResult,
	IDependencyGraphNode,
	IDependencyGraphPluginInput,
	IDependencyGraphSnapshot,
	PluginDependencyLifecycleState,
} from '../contracts/interfaces/dependency-graph.interface';

const DEFAULT_GRAPH_STATE: PluginDependencyLifecycleState = 'validated';

type MutableNode = {
	name: string;
	specifier: string;
	resolvedSpecifier: string;
	dependsOn: string[];
	dependents: string[];
	state: PluginDependencyLifecycleState;
	blockedBy?: string[];
};

const toReadonlyNode = (node: MutableNode): IDependencyGraphNode => ({
	name: node.name,
	specifier: node.specifier,
	resolvedSpecifier: node.resolvedSpecifier,
	dependsOn: [...node.dependsOn],
	dependents: [...node.dependents],
	state: node.state,
	blockedBy: node.blockedBy ? [...node.blockedBy] : undefined,
});

const appendUnique = (
	values: readonly string[] | undefined,
	additions: readonly string[],
): readonly string[] | undefined => {
	if (additions.length === 0) return values;
	const next = new Set(values ?? []);
	for (const addition of additions) next.add(addition);
	return [...next];
};

const insertOrdered = (
	queue: string[],
	pluginName: string,
	inputOrder: ReadonlyMap<string, number>,
): void => {
	if (queue.includes(pluginName)) return;
	const nextIndex = inputOrder.get(pluginName) ?? Number.MAX_SAFE_INTEGER;
	let insertAt = queue.length;
	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index];
		const currentIndex =
			current === undefined
				? Number.MAX_SAFE_INTEGER
				: (inputOrder.get(current) ?? Number.MAX_SAFE_INTEGER);
		if (nextIndex < currentIndex) {
			insertAt = index;
			break;
		}
	}
	queue.splice(insertAt, 0, pluginName);
};

const detectCyclePath = (
	nodes: Readonly<Record<string, IDependencyGraphNode>>,
	inputOrder: ReadonlyMap<string, number>,
): readonly string[] | undefined => {
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const stack: string[] = [];
	const nodeNames = Object.keys(nodes).sort(
		(left, right) =>
			(inputOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
			(inputOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
	);

	const visit = (pluginName: string): readonly string[] | undefined => {
		if (visited.has(pluginName)) return undefined;
		visiting.add(pluginName);
		stack.push(pluginName);
		const node = nodes[pluginName];
		const dependencies = (node?.dependsOn ?? [])
			.filter((dependency) => nodes[dependency] !== undefined)
			.sort(
				(left, right) =>
					(inputOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
					(inputOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
			);
		for (const dependency of dependencies) {
			if (visiting.has(dependency)) {
				const cycleStart = stack.indexOf(dependency);
				return [...stack.slice(cycleStart), dependency];
			}
			const cycle = visit(dependency);
			if (cycle) return cycle;
		}
		stack.pop();
		visiting.delete(pluginName);
		visited.add(pluginName);
		return undefined;
	};

	for (const pluginName of nodeNames) {
		const cycle = visit(pluginName);
		if (cycle) return cycle;
	}
	return undefined;
};

export const buildDependencyGraph = (
	plugins: readonly IDependencyGraphPluginInput[],
): IDependencyGraphSnapshot => {
	const inputOrder = new Map<string, number>();
	const mutableNodes: Record<string, MutableNode> = {};
	for (const [index, plugin] of plugins.entries()) {
		inputOrder.set(plugin.name, index);
		mutableNodes[plugin.name] = {
			name: plugin.name,
			specifier: plugin.specifier,
			resolvedSpecifier: plugin.resolvedSpecifier,
			dependsOn: [...(plugin.dependsOn ?? [])],
			dependents: [],
			state: plugin.initialState ?? DEFAULT_GRAPH_STATE,
		};
	}

	const missingDependencies = plugins
		.map((plugin) => ({
			plugin: plugin.name,
			missing: (plugin.dependsOn ?? []).filter(
				(dependency) => mutableNodes[dependency] === undefined,
			),
		}))
		.filter((entry) => entry.missing.length > 0);

	for (const node of Object.values(mutableNodes)) {
		for (const dependency of node.dependsOn) {
			const dependencyNode = mutableNodes[dependency];
			if (dependencyNode === undefined) continue;
			dependencyNode.dependents.push(node.name);
		}
	}

	for (const node of Object.values(mutableNodes)) {
		node.dependents.sort(
			(left, right) =>
				(inputOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
				(inputOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
		);
	}

	const indegree = new Map<string, number>();
	for (const node of Object.values(mutableNodes)) {
		indegree.set(
			node.name,
			node.dependsOn.filter(
				(dependency) => mutableNodes[dependency] !== undefined,
			).length,
		);
	}

	const queue: string[] = [];
	for (const plugin of plugins) {
		if ((indegree.get(plugin.name) ?? 0) === 0) {
			insertOrdered(queue, plugin.name, inputOrder);
		}
	}

	const order: string[] = [];
	while (queue.length > 0) {
		const pluginName = queue.shift();
		if (pluginName === undefined) break;
		order.push(pluginName);
		for (const dependent of mutableNodes[pluginName]?.dependents ?? []) {
			const remaining = (indegree.get(dependent) ?? 0) - 1;
			indegree.set(dependent, remaining);
			if (remaining === 0) insertOrdered(queue, dependent, inputOrder);
		}
	}

	const nodes = Object.fromEntries(
		Object.entries(mutableNodes).map(([name, node]) => [
			name,
			toReadonlyNode(node),
		]),
	);
	const cyclePath =
		order.length === plugins.length
			? undefined
			: detectCyclePath(nodes, inputOrder);

	return {
		order,
		nodes,
		missingDependencies,
		cycle:
			cyclePath === undefined
				? undefined
				: {
						path: cyclePath,
						plugins: cyclePath.slice(0, -1),
						message: `plugin dependency cycle detected: ${cyclePath.join(' -> ')}`,
					},
	};
};

export const setDependencyGraphState = (
	graph: IDependencyGraphSnapshot,
	pluginName: string,
	state: PluginDependencyLifecycleState,
	options?: { readonly blockedBy?: readonly string[] | undefined },
): IDependencyGraphSnapshot => {
	const current = graph.nodes[pluginName];
	if (current === undefined) return graph;
	const blockedBy =
		state === 'blocked'
			? appendUnique(current.blockedBy, options?.blockedBy ?? [])
			: current.blockedBy;

	return {
		...graph,
		nodes: {
			...graph.nodes,
			[pluginName]: {
				...current,
				state,
				blockedBy,
			},
		},
	};
};

export const blockDependentsForFailure = (
	graph: IDependencyGraphSnapshot,
	pluginName: string,
): IBlockDependentsResult => {
	const root = graph.nodes[pluginName];
	if (root === undefined) return { graph, blocked: [] };

	const queue = root.dependents.map((dependent) => ({
		pluginName: dependent,
		blocker: pluginName,
	}));
	const seen = new Set<string>();
	const blocked: IDependencyGraphNode[] = [];
	let nextGraph = graph;

	while (queue.length > 0) {
		const current = queue.shift();
		if (current === undefined || seen.has(current.pluginName)) continue;
		seen.add(current.pluginName);
		const node = nextGraph.nodes[current.pluginName];
		if (node === undefined) continue;
		const shouldBlock =
			node.state !== 'active' &&
			node.state !== 'failed' &&
			node.state !== 'disposed';
		if (shouldBlock) {
			nextGraph = setDependencyGraphState(
				nextGraph,
				current.pluginName,
				'blocked',
				{
					blockedBy: [current.blocker],
				},
			);
			const updated = nextGraph.nodes[current.pluginName];
			if (node.state !== 'blocked' && updated) blocked.push(updated);
		}
		for (const dependent of node.dependents) {
			queue.push({ pluginName: dependent, blocker: current.pluginName });
		}
	}

	return { graph: nextGraph, blocked };
};
