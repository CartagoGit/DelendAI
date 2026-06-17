import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IWorkspacePathProvider } from '../contracts/interfaces/workspace-paths.interface';
import type { IFileReader } from './analyze-project';
export interface IBootstrapToolOptions {
    readonly workspace: IWorkspacePathProvider;
    /** Namespace for the bootstrap tools, e.g. `mcpcore`. */
    readonly namespacePrefix: string;
    /** Override the reader (tests); default reads from the workspace. */
    readonly reader?: IFileReader;
}
/** A read-only reader backed by the workspace filesystem. */
export declare const createWorkspaceFileReader: (workspace: IWorkspacePathProvider) => IFileReader;
/**
 * The hybrid bootstrap tools. `analyze_project` reads the target repo
 * (read-only) and returns an analysis plus a recommended server plan —
 * "what an optimal MCP server needs here", derived without anyone
 * spelling it out. `create_server` turns a plan into scaffolded files
 * (dry-run: the agent writes them). The server recommends and
 * generates content; the agent decides and writes.
 */
export declare const buildBootstrapToolRegistrations: (options: IBootstrapToolOptions) => readonly IToolRegistration[];
