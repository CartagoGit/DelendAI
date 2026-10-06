/**
 * namespaced-ref.helper.ts — a ref under the product's own namespace,
 * for a project that has one and for one that has none.
 *
 * Every hidden ref was written as `refs/${namespace}/…`. A project with no
 * namespace got `refs//retired/…`, which git refuses: retiring, keeping a
 * husk's files or reserving a slice failed there outright.
 */

/** `refs/<namespace>/<parts…>`, or `refs/<parts…>` with no namespace. */
export const namespacedRef = (
	namespace: string,
	...parts: readonly string[]
): string =>
	['refs', namespace, ...parts].filter((part) => part.length > 0).join('/');
