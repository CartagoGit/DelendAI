/**
 * Pure release planning for the monorepo (N23 — semver + publish automation).
 *
 * Computes a lockstep version bump across every publishable package plus the
 * `@cartago-git/mcp-core` peerDependency rewrite the plugins carry. Kept fully
 * side-effect free so it is unit-testable; the filesystem + `bun publish`
 * driver lives next to it in `release.ts`.
 */

/**
 * Publish order: `@cartago-git/mcp-core` FIRST (every plugin declares it as a
 * `peerDependency`), then the nine plugins. Mirrors docs/NPM_PUBLISH.md §2.
 */
export const PUBLISH_ORDER: readonly string[] = [
	'packages/core',
	'plugins/proposals',
	'plugins/rules',
	'plugins/memory',
	'plugins/git',
	'plugins/quality',
	'plugins/search',
	'plugins/notification',
	'plugins/docs',
	'plugins/deps',
];

/** The peerDependency the plugins pin to the core version. */
export const CORE_PEER = '@cartago-git/mcp-core';

export type BumpKind = 'patch' | 'minor' | 'major';

/** Plain `X.Y.Z` (no prerelease/build metadata — the monorepo never uses them). */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** Bump a plain `X.Y.Z` version. Throws on anything that is not plain semver. */
export function nextVersion(current: string, kind: BumpKind): string {
	const m = SEMVER.exec(current.trim());
	if (m === null) {
		throw new Error(`not a plain X.Y.Z version: "${current}"`);
	}
	let major = Number(m[1]);
	let minor = Number(m[2]);
	let patch = Number(m[3]);
	switch (kind) {
		case 'major':
			major += 1;
			minor = 0;
			patch = 0;
			break;
		case 'minor':
			minor += 1;
			patch = 0;
			break;
		case 'patch':
			patch += 1;
			break;
	}
	return `${major}.${minor}.${patch}`;
}

export interface IReleasePkg {
	/** Workspace-relative directory (e.g. `packages/core`). */
	readonly dir: string;
	/** npm package name. */
	readonly name: string;
	/** Current version. */
	readonly version: string;
	/** Current `peerDependencies['@cartago-git/mcp-core']`, if the package has one. */
	readonly peerCoreRange?: string;
}

export interface IReleaseEntry {
	readonly dir: string;
	readonly name: string;
	readonly from: string;
	readonly to: string;
	readonly peerCoreFrom?: string;
	readonly peerCoreTo?: string;
}

export interface IReleasePlan {
	/** The single version every package is moved to (lockstep). */
	readonly to: string;
	readonly entries: readonly IReleaseEntry[];
}

export type ReleaseTarget = { readonly kind: BumpKind } | { readonly set: string };

function validateExplicit(version: string): string {
	const trimmed = version.trim();
	if (!SEMVER.test(trimmed)) {
		throw new Error(`--set must be a plain X.Y.Z version, got "${version}"`);
	}
	return trimmed;
}

/**
 * Build a lockstep release plan: every package moves to the same target
 * version, and any package carrying the core peerDependency gets it rewritten
 * to `^<target>` (so a 0.x minor bump stays satisfiable). The target is either
 * an explicit `--set=X.Y.Z` or a bump derived from the FIRST package (the core
 * anchor — `PUBLISH_ORDER` puts it first).
 */
export function computeReleasePlan(
	pkgs: readonly IReleasePkg[],
	target: ReleaseTarget
): IReleasePlan {
	const anchor = pkgs[0];
	if (anchor === undefined) {
		throw new Error('no packages to release');
	}
	const to =
		'set' in target ? validateExplicit(target.set) : nextVersion(anchor.version, target.kind);
	const peerTo = `^${to}`;
	const entries = pkgs.map((p): IReleaseEntry => {
		if (p.peerCoreRange !== undefined) {
			return {
				dir: p.dir,
				name: p.name,
				from: p.version,
				to,
				peerCoreFrom: p.peerCoreRange,
				peerCoreTo: peerTo,
			};
		}
		return { dir: p.dir, name: p.name, from: p.version, to };
	});
	return { to, entries };
}
