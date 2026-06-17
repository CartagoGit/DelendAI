import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
/**
 * Default `IWorkspacePathProvider`: resolves workspace-relative
 * paths against an explicit root (never `process.cwd()` implicitly)
 * and memoises resolutions, mirroring the behaviour of the historical
 * the host project `resolveWorkspacePath` helper.
 */
export declare function createWorkspacePathProvider(root: string): IWorkspacePathProvider;
