/**
 * Pure release planning for the monorepo (N23 — semver + publish automation).
 *
 * Computes a lockstep version bump across every publishable package plus the
 * `@delendai/core` peerDependency rewrite the plugins carry. Kept fully
 * side-effect free so it is unit-testable; the filesystem + `bun publish`
 * driver lives next to it in `release.ts`.
 */
/**
 * Publish order: `@delendai/core` FIRST (every plugin declares it as a
 * `peerDependency`), then the transport/client and executable CLI, then every
 * first-party plugin. Publishing every plugin keeps presets and documentation
 * from referring to packages absent from the release.
 */
export declare const PUBLISH_ORDER: readonly string[];
/** Private source packages bundled into the VS Code artifact, never npm-published. */
export declare const BUNDLED_PRIVATE_PACKAGES: readonly string[];
/** The peerDependency the plugins pin to the core version. */
export declare const CORE_PEER = '@delendai/core';
export type BumpKind = 'patch' | 'minor' | 'major';
/** Bump a plain `X.Y.Z` version. Throws on anything that is not plain semver. */
export declare function nextVersion(current: string, kind: BumpKind): string;
export interface IReleasePkg {
	/** Workspace-relative directory (e.g. `packages/core`). */
	readonly dir: string;
	/** npm package name. */
	readonly name: string;
	/** Current version. */
	readonly version: string;
	/** Current `peerDependencies['@delendai/core']`, if the package has one. */
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
export type ReleaseTarget =
	| {
			readonly kind: BumpKind;
	  }
	| {
			readonly set: string;
	  };
/**
 * Build a lockstep release plan: every package moves to the same target
 * version, and any package carrying the core peerDependency gets it rewritten
 * to `^<target>` (so a 0.x minor bump stays satisfiable). The target is either
 * an explicit `--set=X.Y.Z` or a bump derived from the FIRST package (the core
 * anchor — `PUBLISH_ORDER` puts it first).
 */
export declare function computeReleasePlan(
	pkgs: readonly IReleasePkg[],
	target: ReleaseTarget,
): IReleasePlan;
