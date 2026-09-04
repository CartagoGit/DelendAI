/**
 * Maps each rewritable `@delendai/*` package name to the version its OWN
 * `package.json` currently declares. A `workspace:` range always resolves
 * against the target package's own version — never a single version
 * borrowed from the root manifest or any other package — because packages
 * in this monorepo are not guaranteed to share a version outside a lockstep
 * release (and even then, resolving per-package is what actually keeps that
 * guarantee, rather than assuming it).
 */
export interface IWorkspaceDepsPlan {
	readonly packageVersions: ReadonlyMap<string, string>;
}
export interface IRewriteResult {
	readonly rewritten: Readonly<Record<string, unknown>>;
	readonly changedKeys: readonly string[];
}
/**
 * Stage the centralized build output under the package-local `dist/` path
 * required by npm package exports. The source package is never modified.
 */
export declare const stageBuildForPublish: (
	pkgDir: string,
	buildDir: string,
	stageDir: string,
) => Promise<void>;
export declare const rewriteWorkspaceDeps: (
	pkgDir: string,
	plan: IWorkspaceDepsPlan,
) => Promise<IRewriteResult>;
export declare const findWorkspaceConsumers: (
	rootDir: string,
	delendaiPackages: ReadonlySet<string>,
) => Promise<readonly string[]>;
export declare const packRewrittenTarball: (
	pkgDir: string,
	plan: IWorkspaceDepsPlan,
	options?: {
		readonly outDir?: string | undefined;
	},
) => Promise<string>;
