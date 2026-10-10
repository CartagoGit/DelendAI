import type { IWorkspacePathProvider } from './workspace-paths.interface';

/**
 * Options for composing the minimal, plugin-less core tool surface a
 * scaffolded greenfield host must register (`standalone-core-tools.ts`).
 */
export interface IStandaloneCoreToolsOptions {
	/** Tool namespace, e.g. `acme` → `acme_*` tools. */
	readonly namespacePrefix: string;
	readonly workspace: IWorkspacePathProvider;
	readonly projectName: string;
	readonly projectPackageName: string;
	/** Server identity surfaced by `overview`. Defaults derived from the prefix. */
	readonly serverName?: string;
	readonly serverVersion?: string;
	/** Resolved cache/docs roots surfaced by `overview`. Defaults to the CLI defaults. */
	readonly corePaths?: {
		readonly cacheDir: string;
		readonly docsDir: string;
	};
	readonly keepLegacy?: boolean;
}
