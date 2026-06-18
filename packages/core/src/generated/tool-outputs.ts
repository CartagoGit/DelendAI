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

export interface McpVertexAnalyzeProjectOutput {
	[key: string]: unknown;
}

export interface McpVertexCreateProjectOutput {
	[key: string]: unknown;
}

export interface McpVertexGetValidationMatrixOutput {
	scopes: Record<string, {
		command: string;
		expect: string;
	}[]>;
}

export interface McpVertexKnowledgeOutput {
	entries?: {
		id: string;
		title: string;
	}[];
	id?: string;
	title?: string;
	body?: string;
}

export interface McpVertexMetricsOutput {
	tools: Record<string, {
		calls: number;
		errors: number;
		totalMs: number;
		maxMs: number;
		totalBytes: number;
	}>;
	totals: {
		calls: number;
		errors: number;
		totalMs: number;
		totalBytes: number;
	};
	persistedTo?: string;
	snapshots?: number;
}

export interface McpVertexOverviewOutput {
	server: {
		name: string;
		version: string;
	};
	namespacePrefix: string;
	corePaths?: {
		cacheDir: string;
		docsDir: string;
	};
	plugins: Array<string | {
		name: string;
		version?: string;
		describe?: string;
	}>;
	tools: Array<string | {
		name: string;
		summary?: string;
		tags?: string[];
		effects?: Array<"write" | "spawn" | "network" | "destructive">;
	}>;
	knowledge: Array<string | {
		id: string;
		title: string;
	}>;
	recommendedNextAction: string;
}

export interface McpVertexPlanMcpProjectOutput {
	[key: string]: unknown;
}

export interface McpVertexScaffoldOutput {
	[key: string]: unknown;
}

export interface McpVertexStatusOutput {
	collectors: Record<string, unknown>;
	errors: {
		id: string;
		error: string;
	}[];
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface McpVertexToolOutputs {
	"mcp-vertex_analyze_project": McpVertexAnalyzeProjectOutput;
	"mcp-vertex_create_project": McpVertexCreateProjectOutput;
	"mcp-vertex_get_validation_matrix": McpVertexGetValidationMatrixOutput;
	"mcp-vertex_knowledge": McpVertexKnowledgeOutput;
	"mcp-vertex_metrics": McpVertexMetricsOutput;
	"mcp-vertex_overview": McpVertexOverviewOutput;
	"mcp-vertex_plan_mcp_project": McpVertexPlanMcpProjectOutput;
	"mcp-vertex_scaffold": McpVertexScaffoldOutput;
	"mcp-vertex_status": McpVertexStatusOutput;
}
