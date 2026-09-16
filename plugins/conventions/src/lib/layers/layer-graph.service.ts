/**
 * Answering "where does this belong, and what may it import" from the
 * declared layer graph.
 *
 * Pure: the graph is data (`../contracts/constants/layer-graph.constant`)
 * and the set of lints that exist is supplied by the caller, so the spec
 * can feed it the real `package.json` and fail when a declared rule
 * drifts away from the gate that enforces it.
 */

import type {
	ILayerGraph,
	ILayerGraphGap,
	ILayerRule,
} from '../contracts/interfaces/layer-graph.interface';
import { LAYER_GRAPH } from '../contracts/constants/layer-graph.constant';

export { LAYER_GRAPH };

/** The layer a repo-relative path belongs to, longest prefix wins. */
export const layerOf = (
	relPath: string,
	graph: ILayerGraph = LAYER_GRAPH,
): string | undefined => {
	let best: { id: string; length: number } | undefined;
	for (const layer of graph.layers) {
		for (const prefix of layer.prefixes) {
			if (
				(relPath === prefix || relPath.startsWith(`${prefix}/`)) &&
				(best === undefined || prefix.length > best.length)
			) {
				best = { id: layer.id, length: prefix.length };
			}
		}
	}
	return best?.id;
};

/** What the layer containing `relPath` may not import. */
export const rulesFor = (
	relPath: string,
	graph: ILayerGraph = LAYER_GRAPH,
): readonly ILayerRule[] => {
	const layer = layerOf(relPath, graph);
	if (layer === undefined) return [];
	return graph.rules.filter((rule) => rule.from === layer || rule.from === '*');
};

/**
 * Rules whose enforcer is not among the lints that exist.
 *
 * A declaration nothing checks is a comment. Reporting the gap is the
 * difference between "this is enforced" and "we believe this".
 */
export const findUnenforcedRules = (
	knownLints: ReadonlySet<string>,
	graph: ILayerGraph = LAYER_GRAPH,
): readonly ILayerGraphGap[] => {
	const gaps: ILayerGraphGap[] = [];
	for (const rule of graph.rules) {
		if (rule.unenforced === true) {
			gaps.push({ rule, reason: 'declared-unenforced' });
			continue;
		}
		if (!knownLints.has(rule.enforcedBy)) {
			gaps.push({ rule, reason: 'no-such-lint' });
		}
	}
	return gaps;
};
