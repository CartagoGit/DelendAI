/**
 * skills/sources/package-root.ts — q00009 / f00263.
 *
 * Resolve a package root from a module URL without hardcoding monorepo
 * layouts. The contract:
 *
 *   given `import.meta.url` of a module that lives INSIDE the package,
 *   return the directory that contains that package's `package.json`.
 *
 * This is what makes the resolver portable: in the monorepo, the module
 * URL is `packages/core/src/lib/skills/...` and the package root is
 * `packages/core/`. In an installed consumer, the module URL is
 * `node_modules/@mcp-vertex/core/src/lib/skills/...` (or a compiled
 * equivalent) and the package root is `node_modules/@mcp-vertex/core/`.
 *
 * Both work with the same algorithm: walk up from the module URL until
 * a `package.json` is found. Stop at the first one. Stop at the file
 * system root if no package.json is found (return null).
 */

import { dirname as dirnamePath } from 'node:path';

export interface IResolvePackageRootInput {
	/** Module URL of a file known to live inside the target package. */
	readonly moduleUrl: string;
	/** Path resolver; default = `dirname`. Allows tests to inject. */
	readonly dirnameFn?: (path: string) => string;
	/** File-system reader for `package.json`. Returns null when absent. */
	readonly readJson?: (path: string) => Promise<unknown>;
}

/**
 * Convert a `file://` URL to a filesystem path. Kept as a separate
 * helper so tests can inject their own URL form.
 */
export const fileUrlToPath = (url: string): string => {
	if (url.startsWith('file://')) {
		const stripped = url.slice('file://'.length);
		try {
			return decodeURIComponent(stripped);
		} catch {
			return stripped;
		}
	}
	return url;
};

/**
 * Walk up from `startPath` until a directory containing `package.json`
 * is found. Returns the directory path, or `null` if none is found
 * before reaching the file-system root.
 */
export const resolvePackageRoot = async (
	input: IResolvePackageRootInput,
): Promise<string | null> => {
	const dirname = input.dirnameFn ?? ((p: string): string => dirnamePath(p));
	const readJson = input.readJson;
	let dir = dirname(fileUrlToPath(input.moduleUrl));
	let guard = 0;
	while (guard++ < 64) {
		const candidate = `${dir}/package.json`;
		if (readJson) {
			const parsed = await readJson(candidate);
			if (parsed !== null && parsed !== undefined) return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
	return null;
};

/**
 * Skill root inside a package: `<packageRoot>/skills/<skillId>/SKILL.md`.
 * The function is intentionally tiny; the resolver composes it.
 */
export const skillRootForPackage = (
	packageRoot: string,
	skillId: string,
): string => `${packageRoot}/skills/${skillId}/SKILL.md`;

/**
 * Plugin skill root inside a plugin package:
 * `<packageRoot>/skills/<skillId>/SKILL.md` (same shape as core, but
 * the package IS the plugin's package).
 */
export const skillRootForPluginPackage = (
	pluginPackageRoot: string,
	skillId: string,
): string => skillRootForPackage(pluginPackageRoot, skillId);
