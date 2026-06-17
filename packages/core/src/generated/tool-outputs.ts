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

export interface McpcoreAnalyzeProjectOutput {
	[key: string]: unknown;
}

export interface McpcoreCreateServerOutput {
	[key: string]: unknown;
}

export interface McpcoreGetValidationMatrixOutput {
	scopes: Record<string, {
		command: string;
		expect: string;
	}[]>;
}

export interface McpcoreKnowledgeOutput {
	entries?: {
		id: string;
		title: string;
	}[];
	id?: string;
	title?: string;
	body?: string;
}

export interface McpcoreMetricsOutput {
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
}

export interface McpcoreOverviewOutput {
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
	}>;
	knowledge: Array<string | {
		id: string;
		title: string;
	}>;
	recommendedNextAction: string;
}

export interface McpcorePlanMcpServerOutput {
	[key: string]: unknown;
}

export interface McpcoreScaffoldOutput {
	[key: string]: unknown;
}

export interface McpcoreStatusOutput {
	collectors: Record<string, unknown>;
	errors: {
		id: string;
		error: string;
	}[];
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface McpCoreToolOutputs {
	"mcpcore_analyze_project": McpcoreAnalyzeProjectOutput;
	"mcpcore_create_server": McpcoreCreateServerOutput;
	"mcpcore_get_validation_matrix": McpcoreGetValidationMatrixOutput;
	"mcpcore_knowledge": McpcoreKnowledgeOutput;
	"mcpcore_metrics": McpcoreMetricsOutput;
	"mcpcore_overview": McpcoreOverviewOutput;
	"mcpcore_plan_mcp_server": McpcorePlanMcpServerOutput;
	"mcpcore_scaffold": McpcoreScaffoldOutput;
	"mcpcore_status": McpcoreStatusOutput;
}
