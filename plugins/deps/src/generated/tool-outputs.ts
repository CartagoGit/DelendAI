/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Typed `structuredContent` shapes for this package's MCP tools,
 * generated from each tool's Zod `outputSchema` by:
 *
 *     bun run types:generate
 *
 * The drift guard in the test suite fails if this file is stale, so any
 * change to a tool's `outputSchema` must be accompanied by a regenerate.
 * Action-multiplexed tools whose schema is intentionally permissive
 * surface as `Record<string, unknown>`.
 */

export interface McpVertexDepsDepsAuditOutput {
	tool: string;
	findings: Array<{
		ruleId: string;
		severity: "critical" | "high" | "medium" | "low" | "info";
		message: string;
		fix?: string;
		location?: {
			file: string;
			line?: number;
			endLine?: number;
		};
	}>;
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	ranAt: string;
	skipped?: boolean;
	note?: string;
	worst: string;
}

export interface McpVertexDepsDepsCheckOutput {
	manifest: string;
	lockfile: {
		present: boolean;
		kind: string | null;
	};
	findings: {
		kind: string;
		dep?: string;
		detail: string;
	}[];
	healthy: boolean;
}

export interface McpVertexDepsDepsLicensesOutput {
	tool: string;
	findings: Array<{
		ruleId: string;
		severity: "critical" | "high" | "medium" | "low" | "info";
		message: string;
		fix?: string;
		location?: {
			file: string;
			line?: number;
			endLine?: number;
		};
	}>;
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	worst: string;
}

export interface McpVertexDepsDepsListOutput {
	detail?: "compact" | "normal" | "full";
	manifest: string;
	found: boolean;
	counts: {
		dependencies: number;
		devDependencies: number;
		peerDependencies: number;
		optionalDependencies: number;
	};
	deps: {
		name: string;
		range: string;
		section: string;
	}[];
}

export interface McpVertexDepsDepsOutdatedOutput {
	manifest: string;
	checked: number;
	outdatedCount: number;
	entries: Array<{
		name: string;
		range: string;
		section: string;
		wanted: string | null;
		latest: string | null;
		outdated: boolean;
		error?: string;
	}>;
	truncated: boolean;
}

export interface McpVertexDepsDepsPolyglotOutput {
	detail?: "compact" | "normal" | "full";
	manifests: {
		ecosystem: string;
		manifest: string;
		deps: {
			ecosystem: string;
			name: string;
			range: string;
			section: string;
		}[];
	}[];
}

export interface McpVertexDepsDepsTreeOutput {
	manifest: string;
	lockfile: string;
	lockfileFound: boolean;
	root: {
		name: string;
		version: string | null;
		children: Array<{
			name: string;
			version: string | null;
			section?: "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies";
			children: unknown[];
		}>;
	};
	totalNodes: number;
	maxDepth: number;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface DepsToolOutputs {
	"mcp-vertex_deps_deps_audit": McpVertexDepsDepsAuditOutput;
	"mcp-vertex_deps_deps_check": McpVertexDepsDepsCheckOutput;
	"mcp-vertex_deps_deps_licenses": McpVertexDepsDepsLicensesOutput;
	"mcp-vertex_deps_deps_list": McpVertexDepsDepsListOutput;
	"mcp-vertex_deps_deps_outdated": McpVertexDepsDepsOutdatedOutput;
	"mcp-vertex_deps_deps_polyglot": McpVertexDepsDepsPolyglotOutput;
	"mcp-vertex_deps_deps_tree": McpVertexDepsDepsTreeOutput;
}
