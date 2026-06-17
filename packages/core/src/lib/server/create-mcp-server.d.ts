import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IMcpCoreHostConfig } from '../contracts/interfaces/host-config.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
/**
 * An assembled (but not yet connected) MCP server. `start()` connects
 * the stdio transport; `registrationOrder` exposes the exact tool
 * registration sequence for audits and tests.
 */
export interface IMcpCoreServer {
    readonly server: McpServer;
    readonly registrationOrder: readonly string[];
    start(): Promise<void>;
}
/**
 * Compute the final registration sequence: core registrations first
 * (in declared order), then each extra appended at the end — or, when
 * `registerAfter` names an anchor, inserted immediately after it.
 * Multiple extras anchored to the same id keep declaration order.
 * Pure and deterministic; throws on duplicate ids and unknown anchors
 * so a misconfigured host fails fast instead of drifting silently.
 */
export declare function planRegistrationOrder(core: readonly IToolRegistration[], extras: readonly IToolRegistration[]): readonly IToolRegistration[];
/**
 * Assemble an MCP server from a host config: deterministic tool
 * registration (core + extras), then prompts, then resources. The
 * caller starts the stdio transport via `start()`.
 */
export declare function createMcpServer(config: IMcpCoreHostConfig): Promise<IMcpCoreServer>;
