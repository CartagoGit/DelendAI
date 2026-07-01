/**
 * Resolves workspace-relative paths to absolute paths. The host
 * project decides where its workspace root lives; mcp-vertex code must
 * never call `process.cwd()` or hardcode directory layouts.
 */
export interface IWorkspacePathProvider {
	/** Absolute workspace root. */
	readonly root: string;
	/** Resolve a workspace-relative path to an absolute path. */
	resolve(relativePath: string): string;
}
