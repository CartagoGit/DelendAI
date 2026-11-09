/**
 * namespaced-ref.helper.ts — a ref under the product's own namespace,
 * for a project that has one and for one that has none.
 *
 * Every hidden ref was written as `refs/${namespace}/…`. A project with no
 * namespace got `refs//retired/…`, which git refuses: retiring, keeping a
 * husk's files or reserving a slice failed there outright.
 */

import { ownedNamespaces } from '../integration/decisions/namespaces.helper';

/** `refs/<namespace>/<parts…>`, or `refs/<parts…>` with no namespace. */
export const namespacedRef = (
	namespace: string,
	...parts: readonly string[]
): string =>
	['refs', namespace, ...parts].filter((part) => part.length > 0).join('/');

/**
 * The same ref under each owned namespace, current first, for READERS:
 * a tip kept under a former namespace stays found (f00808). Writers use
 * `namespacedRef` with the current namespace alone.
 */
export const ownedRefRoots = (
	namespaces: readonly string[],
	...parts: readonly string[]
): readonly string[] => [
	...new Set(
		namespaces.map((namespace) => namespacedRef(namespace, ...parts)),
	),
];

/** `ownedRefRoots` over the namespaces a policy owns, current first. */
export const ownedRootsOf = (
	branches: Parameters<typeof ownedNamespaces>[0],
	...parts: readonly string[]
): readonly string[] => ownedRefRoots(ownedNamespaces(branches), ...parts);
