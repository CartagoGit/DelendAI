/**
 * Replace local `$ref`s with their targets before the spec is parsed.
 *
 * Almost every real spec keeps its schemas under `components`, so a parser
 * that ignores `$ref` turns them into empty schemas: mocks come back null
 * and every response validates. A reference that cannot be followed stays
 * an empty schema, and is counted so the parse note can say so.
 */
import type { IDereferenced } from '../contracts/interfaces/dereference.interface';

/** Shared targets multiply: a hostile spec must not expand without bound. */
const MAX_EXPANDED_NODES = 200_000;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const decodeSegment = (segment: string): string =>
	decodeURIComponent(segment).replaceAll('~1', '/').replaceAll('~0', '~');

/** Follow a `#/a/b` pointer; undefined when it leaves the document. */
const lookup = (root: unknown, ref: string): unknown => {
	if (!ref.startsWith('#/')) return undefined;
	let node = root;
	for (const segment of ref.slice('#/'.length).split('/')) {
		const key = decodeSegment(segment);
		if (!isPlainObject(node) || !Object.hasOwn(node, key)) return undefined;
		node = node[key];
	}
	return node;
};

/** Only `paths` is expanded: the parser never reads `components` itself. */
export const dereference = (
	root: Readonly<Record<string, unknown>>,
): IDereferenced => {
	let budget = MAX_EXPANDED_NODES;
	let unresolved = 0;
	const walk = (node: unknown, trail: ReadonlySet<string>): unknown => {
		budget -= 1;
		if (budget < 0) {
			unresolved += 1;
			return {};
		}
		if (Array.isArray(node)) return node.map((n) => walk(n, trail));
		if (!isPlainObject(node)) return node;
		const ref = node.$ref;
		if (typeof ref === 'string') {
			const target = trail.has(ref) ? undefined : lookup(root, ref);
			if (target === undefined) {
				unresolved += 1;
				return {};
			}
			return walk(target, new Set([...trail, ref]));
		}
		return Object.fromEntries(
			Object.entries(node).map(([key, value]) => [
				key,
				walk(value, trail),
			]),
		);
	};
	const paths = walk(root.paths, new Set());
	return { paths, unresolved };
};
