/**
 * Structural seam for host runtime status (in the host project: the engine
 * game-loop status). mcp-core never imports host packages; the host
 * wraps its own runtime in a collector and injects it.
 */
export interface IStatusCollector {
    /** Stable id surfaced in status payloads, e.g. `engine-loop`. */
    readonly id: string;
    collect(): Promise<Readonly<Record<string, unknown>>>;
}
