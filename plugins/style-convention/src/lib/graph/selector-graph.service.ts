/**
 * selector-graph.service.ts — every selector, the files that define it
 * and the surfaces that use it.
 *
 * Two ratchets already half-walk this: one checks that a used class is
 * defined somewhere, the other that shared classes are not forked. This
 * is the whole graph, read with the same parser, so that before a
 * stylesheet is edited somebody can ask what the edit reaches.
 */
import type {
	ISelectorConsumer,
	ISelectorGraph,
	ISelectorImpact,
	ISelectorNode,
	IStyleSource,
} from '../contracts/interfaces/selector-graph.interface';
import {
	extractDefinedClasses,
	extractUsedClasses,
	parseAstro,
} from '../parse/style-sources.service';

/** How many leading path segments name a package (`apps/web`, `plugins/git`). */
const PACKAGE_SEGMENTS = 2;

/** The package a workspace-relative path belongs to. */
export const packageOf = (path: string): string =>
	path.split('/').slice(0, PACKAGE_SEGMENTS).join('/');

const push = (map: Map<string, Set<string>>, key: string, value: string) => {
	const set = map.get(key) ?? new Set<string>();
	set.add(value);
	map.set(key, set);
};

/**
 * Build the graph from stylesheets and markup. A markup file's own
 * `<style>` blocks define selectors for that file; its class attributes
 * use them.
 */
export const buildSelectorGraph = (input: {
	readonly stylesheets: readonly IStyleSource[];
	readonly markup: readonly IStyleSource[];
}): ISelectorGraph => {
	const defined = new Map<string, Set<string>>();
	const used = new Map<string, Set<string>>();
	const byFile = new Map<string, Set<string>>();
	const define = (path: string, text: string): void => {
		for (const name of extractDefinedClasses(text)) {
			push(defined, name, path);
			push(byFile, path, name);
		}
	};
	for (const sheet of input.stylesheets) define(sheet.path, sheet.text);
	for (const file of input.markup) {
		const parts = parseAstro(file.text);
		for (const block of parts.styleBlocks) define(file.path, block);
		for (const { className } of extractUsedClasses(parts.markup)) {
			push(used, className, file.path);
		}
	}
	const names = [...new Set([...defined.keys(), ...used.keys()])].sort();
	const selectors = new Map<string, ISelectorNode>(
		names.map((name) => [
			name,
			{
				name,
				definedIn: [...(defined.get(name) ?? [])].sort(),
				usedBy: [...(used.get(name) ?? [])].sort(),
			},
		]),
	);
	return {
		selectors,
		definedBy: new Map(
			[...byFile.entries()].map(([path, set]) => [path, [...set].sort()]),
		),
	};
};

/** What a change to one selector reaches. */
export const impactOfSelector = (
	graph: ISelectorGraph,
	selector: string,
): ISelectorImpact | undefined => {
	const node = graph.selectors.get(selector.replace(/^\./u, ''));
	if (node === undefined) return undefined;
	const owners = new Set(node.definedIn.map(packageOf));
	const consumers: ISelectorConsumer[] = node.usedBy.map((path) => ({
		path,
		package: packageOf(path),
		crossesBoundary: owners.size > 0 && !owners.has(packageOf(path)),
	}));
	return {
		selector: node.name,
		definedIn: node.definedIn,
		consumers,
		crossBoundary: consumers.filter((each) => each.crossesBoundary).length,
	};
};

/** What a change to one file reaches: the impact of every selector it defines. */
export const impactOfFile = (
	graph: ISelectorGraph,
	path: string,
): readonly ISelectorImpact[] =>
	(graph.definedBy.get(path) ?? []).flatMap((name) => {
		const impact = impactOfSelector(graph, name);
		return impact === undefined ? [] : [impact];
	});
