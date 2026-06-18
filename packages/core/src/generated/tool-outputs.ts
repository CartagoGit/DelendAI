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

export interface McpvertexAnalyzeProjectOutput {
	[key: string]: unknown;
}

export interface McpvertexCreateProjectOutput {
	[key: string]: unknown;
}

export interface McpvertexGetValidationMatrixOutput {
	scopes: Record<string, {
		command: string;
		expect: string;
	}[]>;
}

export interface McpvertexKnowledgeOutput {
	entries?: {
		id: string;
		title: string;
	}[];
	id?: string;
	title?: string;
	body?: string;
}

export interface McpvertexMetricsOutput {
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

export interface McpvertexOverviewOutput {
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

export interface McpvertexPlanMcpProjectOutput {
	[key: string]: unknown;
}

export interface McpvertexScaffoldOutput {
	[key: string]: unknown;
}

export interface McpvertexStatusOutput {
	collectors: Record<string, unknown>;
	errors: {
		id: string;
		error: string;
	}[];
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface McpVertexToolOutputs {
	"mcpvertex_analyze_project": McpvertexAnalyzeProjectOutput;
	"mcpvertex_create_project": McpvertexCreateProjectOutput;
	"mcpvertex_get_validation_matrix": McpvertexGetValidationMatrixOutput;
	"mcpvertex_knowledge": McpvertexKnowledgeOutput;
	"mcpvertex_metrics": McpvertexMetricsOutput;
	"mcpvertex_overview": McpvertexOverviewOutput;
	"mcpvertex_plan_mcp_project": McpvertexPlanMcpProjectOutput;
	"mcpvertex_scaffold": McpvertexScaffoldOutput;
	"mcpvertex_status": McpvertexStatusOutput;
}
