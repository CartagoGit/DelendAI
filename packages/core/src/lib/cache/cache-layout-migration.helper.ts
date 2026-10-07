/**
 * cache-layout-migration.ts
 *
 * Pure rules of the cache layout lifecycle: what a layout migration may
 * delete, and how a chain of `N -> N + 1` steps is assembled. No
 * filesystem and no SQLite here, so every rule is testable without a
 * workspace. The operations that touch the disk are the helpers a
 * migration receives in its context.
 */
import { CACHE_PERSISTENT_CLASSES } from '../contracts/constants/cache-layout.constant';

import type {
	ICacheArtifactDescriptor,
	ICacheLayoutManifest,
	ICacheLayoutMigration,
} from '../contracts/interfaces/cache-layout.interface';

/** A layout rule was broken: a bad path, an unsafe drop, a broken chain. */
export class CacheLayoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CacheLayoutError';
	}
}

const segmentsOf = (relPath: string): readonly string[] =>
	relPath.split('/').filter((segment) => segment.length > 0);

/** True for a non-empty, relative, `/`-separated path with no `..` or `.`. */
export const isContainedRelativePath = (relPath: string): boolean => {
	if (relPath.length === 0 || relPath.startsWith('/')) return false;
	if (relPath.includes('\\') || /^[A-Za-z]:/.test(relPath)) return false;
	const segments = relPath.split('/');
	return segments.every(
		(segment) => segment.length > 0 && segment !== '.' && segment !== '..',
	);
};

export const assertContainedRelativePath = (relPath: string): void => {
	if (!isContainedRelativePath(relPath))
		throw new CacheLayoutError(
			`cache-relative path is not contained: ${JSON.stringify(relPath)}`,
		);
};

const isSameOrInside = (inner: readonly string[], outer: readonly string[]) =>
	outer.length <= inner.length &&
	outer.every((segment, index) => inner[index] === segment);

/**
 * The manifest entry that owns a path: the entry whose path equals it or
 * contains it. The longest match wins so a nested entry beats its parent.
 */
export const findOwningArtifact = (
	manifest: ICacheLayoutManifest,
	relPath: string,
): ICacheArtifactDescriptor | undefined => {
	const target = segmentsOf(relPath);
	let best: ICacheArtifactDescriptor | undefined;
	for (const artifact of manifest.artifacts) {
		const candidate = segmentsOf(artifact.path);
		if (!isSameOrInside(target, candidate)) continue;
		if (
			best === undefined ||
			candidate.length > segmentsOf(best.path).length
		)
			best = artifact;
	}
	return best;
};

/**
 * Refuse a drop that would delete persistent data of the CURRENT layout.
 *
 * Three cases are refused: the path is, or lies inside, a records or
 * operational artifact; or the path CONTAINS one (dropping `results`
 * would take `results/memory` with it). Anything else is a legacy path
 * the migration itself names, which the current manifest does not know.
 */
export const assertDroppable = (
	manifest: ICacheLayoutManifest,
	relPath: string,
): void => {
	assertContainedRelativePath(relPath);
	const target = segmentsOf(relPath);
	for (const artifact of manifest.artifacts) {
		if (!CACHE_PERSISTENT_CLASSES.includes(artifact.class)) continue;
		const protectedPath = segmentsOf(artifact.path);
		if (
			isSameOrInside(target, protectedPath) ||
			isSameOrInside(protectedPath, target)
		)
			throw new CacheLayoutError(
				`refusing to drop ${relPath}: it overlaps ${artifact.class} artifact ${artifact.id} (${artifact.path})`,
			);
	}
};

/** Problems that make a manifest unfit to document a layout. */
export const validateCacheLayoutManifest = (
	manifest: ICacheLayoutManifest,
): readonly string[] => {
	const problems: string[] = [];
	const ids = new Set<string>();
	const paths = new Set<string>();
	for (const artifact of manifest.artifacts) {
		if (ids.has(artifact.id)) problems.push(`duplicate id ${artifact.id}`);
		ids.add(artifact.id);
		if (paths.has(artifact.path))
			problems.push(`duplicate path ${artifact.path}`);
		paths.add(artifact.path);
		if (!isContainedRelativePath(artifact.path))
			problems.push(`path not contained: ${artifact.path}`);
	}
	return problems;
};

/**
 * The migrations that carry a cache from `appliedEpoch` to `targetEpoch`,
 * in order. Always the full chain, one epoch per step; a gap, a repeated
 * step or a downgrade is an error, never a guess.
 */
export const resolveMigrationChain = (
	migrations: readonly ICacheLayoutMigration[],
	appliedEpoch: number,
	targetEpoch: number,
): readonly ICacheLayoutMigration[] => {
	if (appliedEpoch > targetEpoch)
		throw new CacheLayoutError(
			`cache layout epoch ${appliedEpoch} is newer than this build (${targetEpoch}); refusing to downgrade`,
		);
	const byFromEpoch = new Map<number, ICacheLayoutMigration>();
	for (const migration of migrations) {
		if (migration.toEpoch !== migration.fromEpoch + 1)
			throw new CacheLayoutError(
				`migration ${migration.id} must advance exactly one epoch (${migration.fromEpoch} -> ${migration.toEpoch})`,
			);
		if (byFromEpoch.has(migration.fromEpoch))
			throw new CacheLayoutError(
				`two migrations start at epoch ${migration.fromEpoch}`,
			);
		byFromEpoch.set(migration.fromEpoch, migration);
	}
	const chain: ICacheLayoutMigration[] = [];
	for (let epoch = appliedEpoch; epoch < targetEpoch; epoch += 1) {
		const step = byFromEpoch.get(epoch);
		if (step === undefined)
			throw new CacheLayoutError(
				`no cache layout migration ${epoch} -> ${epoch + 1}`,
			);
		chain.push(step);
	}
	return chain;
};
