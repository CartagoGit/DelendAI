import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
export interface IOverviewToolEntry {
    readonly name: string;
    readonly summary?: string | undefined;
    readonly tags?: readonly string[] | undefined;
}
export interface IOverviewPlugin {
    readonly name: string;
    readonly version?: string | undefined;
    readonly describe?: string | undefined;
}
export interface IOverviewSnapshot {
    readonly server: {
        readonly name: string;
        readonly version: string;
    };
    readonly namespacePrefix: string;
    readonly corePaths: {
        readonly cacheDir: string;
        readonly docsDir: string;
    };
    readonly plugins: readonly IOverviewPlugin[];
    readonly tools: readonly IOverviewToolEntry[];
    readonly knowledge: ReadonlyArray<{
        readonly id: string;
        readonly title: string;
    }>;
    readonly recommendedNextAction: string;
}
/**
 * The single cold-start entry point. One call returns the whole map of
 * the server — identity, loaded plugins, every tool with a one-line
 * summary, available knowledge ids, resolved paths and a recommended
 * first action — so any agent or model can orient itself in one
 * low-token round-trip instead of probing tool by tool.
 */
export declare const buildOverviewToolRegistration: (namespacePrefix: string, snapshot: () => IOverviewSnapshot) => IToolRegistration;
