/**
 * audit-run.tool-options.ts — `IRunToolOptions` for
 * `<prefix>_audit_run` (alcance B, f00077).
 *
 * Pure type declaration, no runtime cost. Extracted from
 * `audit-run.tool.ts` so the tool file stays focused on its
 * registration + handler plumbing (x00091 / s2).
 *
 * `IRunToolOptions` stays re-exported from `audit-run.tool.ts` so
 * the audit plugin's public barrel (which currently re-exports it
 * as `IRunToolOptions`) keeps compiling unchanged.
 */

import type {
	ILayerConfig,
} from '../services/audit-brief.service';
import type { IHttpTransport } from '../services/llm-client.service';

/**
 * Options passed to `buildRunRegistration`. Host-level options
 * (workspace root, configured layers, project name, ...) plus the
 * test seams the e2e spec wires (`transport`, `now`,
 * `knownProposalIds`, `peerPlugins`).
 */
export interface IRunToolOptions {
	readonly namespacePrefix: string;
	/** Absolute workspace root, used to resolve relative paths. */
	readonly workspaceRoot: string;
	/** Default `auditDir` (workspace-relative). */
	readonly defaultAuditDir: string;
	/** Default `proposalsDir` (workspace-relative). */
	readonly defaultProposalsDir: string;
	/** Default dimensions for the brief. Wired from `ctx.options.dimensions`. */
	readonly dimensions?: readonly string[];
	/** Configured layers, wired from `ctx.options.layers`. */
	readonly layers?: readonly ILayerConfig[];
	/** Project name forwarded to the brief + consolidation renderer. */
	readonly projectName?: string;
	/** Config file hint forwarded to the brief. */
	readonly configFileName?: string;
	/**
	 * Cross-cutting additions for the brief. Wired from
	 * `ctx.options.crossCuttingAdditions`.
	 */
	readonly crossCuttingAdditions?: readonly string[];
	/**
	 * Id set already known to the registry. The tool reads the
	 * cached proposals index so we never collide with an id the
	 * user authored. Optional: when omitted, the scaffolder falls
	 * back to an empty set (still correct, but may collide with
	 * pre-existing proposals if the host forgets to wire it).
	 */
	readonly knownProposalIds?: ReadonlySet<string>;
	/**
	 * Peer-plugin registry forwarded from
	 * `IMcpPluginContext.peerPlugins`. Used by the auto-scaffolder
	 * to detect whether the `proposals` plugin is loaded in the
	 * same MCP server. Empty/missing at register time;
	 * populated by the core once `loadPlugins()` returns.
	 */
	readonly peerPlugins?: import('@mcp-vertex/core/public').IPeerPluginRegistry;
	/**
	 * Default for the `autoScaffoldProposals` flag. Per-call
	 * `scaffoldProposals: false` overrides it. When the proposals
	 * plugin is loaded AND opt-in is on, every run also scaffolds
	 * the dedup'd findings into fix proposals.
	 */
	readonly autoScaffoldProposals?: boolean;
	/**
	 * Transport for outbound HTTP. The default uses global
	 * `fetch`; the e2e spec injects an in-memory mock.
	 */
	readonly transport?: IHttpTransport;
	/** Optional clock injection for tests. */
	readonly now?: () => Date;
}