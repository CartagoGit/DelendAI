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
export const PUBLISH_ORDER: readonly string[] = [
	// Leaf contracts package: `github`, `gitlab` and
	// `remote-provider-core` declare it as a dependency, so it must be
	// packed and installed before them or an external install resolves
	// `@delendai/contracts` from the registry and 404s.
	'packages/contracts',
	'packages/core',
	'packages/client',
	'packages/cli',
	'plugins/adaptive-optimizer',
	'plugins/agent-orchestrator',
	'plugins/auto-agent-selector',
	'plugins/auto-plugin-selector',
	'plugins/api',
	'plugins/audit',
	'plugins/audit-orchestrator',
	'plugins/browser',
	'plugins/cache',
	'plugins/completion',
	'plugins/commit-policy',
	'plugins/container',
	'plugins/context-for-change',
	'plugins/conventions',
	'plugins/impact-analysis',
	'plugins/project-health',
	'plugins/quality-policy',
	'plugins/database',
	'plugins/deps',
	'plugins/diagram',
	'plugins/docs',
	'plugins/env',
	'plugins/error-reporting',
	'plugins/external-mcps',
	'plugins/forge',
	'plugins/git',
	'plugins/github',
	'plugins/gitlab',
	'plugins/i18n',
	'plugins/issues',
	'plugins/link-check',
	'plugins/logs',
	'plugins/memory',
	'plugins/notification',
	'plugins/observability',
	'plugins/orchestrator-runner',
	'plugins/perf',
	'plugins/project-kpis',
	'plugins/proposals',
	'plugins/prompts-pack',
	'plugins/prompt-eval',
	'plugins/quality',
	'plugins/remote-provider-core',
	'plugins/refactor',
	'plugins/rules',
	'plugins/search',
	'plugins/security',
	'plugins/skills-pack',
	'plugins/status-marker',
	'plugins/tech-debt',
	'plugins/test-convention',
	'plugins/test-policy',
	'plugins/usage-tracking',
	'plugins/web-fetch',
];

/** Private source packages bundled into the VS Code artifact, never npm-published. */
export const BUNDLED_PRIVATE_PACKAGES: readonly string[] = [
	'packages/ui-extension',
	'apps/shared',
];

/** The peerDependency the plugins pin to the core version. */
export const CORE_PEER = '@delendai/core';

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
	| { readonly kind: BumpKind }
	| { readonly set: string };

function validateExplicit(version: string): string {
	const trimmed = version.trim();
	if (!SEMVER.test(trimmed)) {
		throw new Error(
			`--set must be a plain X.Y.Z version, got "${version}"`,
		);
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
	target: ReleaseTarget,
): IReleasePlan {
	const anchor = pkgs[0];
	if (anchor === undefined) {
		throw new Error('no packages to release');
	}
	const to =
		'set' in target
			? validateExplicit(target.set)
			: nextVersion(anchor.version, target.kind);
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
