import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IStatusCollector } from '../contracts/interfaces/status-collector.interface';
export interface IStatusResult {
    readonly collectors: Readonly<Record<string, unknown>>;
    readonly errors: ReadonlyArray<{
        readonly id: string;
        readonly error: string;
    }>;
}
/**
 * Aggregate every registered `IStatusCollector.collect()` into one
 * read-only status payload, keyed by collector id. A collector that
 * throws is captured in `errors` (never sinks the whole call). This is
 * the consumer that makes the `statusCollectors` host seam real: a host
 * wraps its runtime (e.g. a game loop) in a collector and this tool
 * surfaces it; the CLI also registers a built-in `mcp-core` collector
 * reporting loaded plugins + counts. [N23]
 */
export declare const collectStatus: (collectors: readonly IStatusCollector[]) => Promise<IStatusResult>;
export declare const buildStatusToolRegistration: (namespacePrefix: string, collectors: readonly IStatusCollector[]) => IToolRegistration;
