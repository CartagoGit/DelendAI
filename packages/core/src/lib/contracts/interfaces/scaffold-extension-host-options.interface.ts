export interface IScaffoldExtensionHostOptions {
	/** Host id, e.g. `jetbrains` or `neovim`. */
	readonly hostName: string;
	/** One-line description of the extension host. */
	readonly description: string;
	/** npm scope for the package name (default `@cartago-git`). */
	readonly scope?: string;
}
