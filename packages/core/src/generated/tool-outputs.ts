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
	analysis: {
		hasPackageJson: boolean;
		name?: string;
		projectType: "library" | "cli" | "webapp" | "game" | "monorepo" | "generic";
		language: "typescript" | "javascript" | "python" | "go" | "rust" | "unknown";
		packageManager: "bun" | "pnpm" | "yarn" | "npm" | "unknown";
		framework?: string;
		testRunner: "vitest" | "jest" | "bun" | "node" | "unknown";
		monorepoTool?: string;
		hasMcpProject: boolean;
		mcpEvidence: string[];
		ci: string[];
		agentConfigs: string[];
		scripts: Record<string, string>;
		signals: string[];
	};
	plan: {
		projectType: "library" | "cli" | "webapp" | "game" | "monorepo" | "generic";
		serverName: string;
		namespacePrefix: string;
		plugins: string[];
		tools: {
			name: string;
			description: string;
		}[];
		validationCommands: Record<string, string>;
		cacheDir: string;
		docsDir: string;
		mcpJson: Record<string, unknown>;
		notes: string[];
	};
}

export interface McpVertexCreateProjectOutput {
	kind: "host" | "plugin" | "client";
	files: {
		path: string;
		content: string;
	}[];
}

export interface McpVertexFsReadOutput {
	path: string;
	found: boolean;
	content: string | null;
	totalLines: number | null;
	range: unknown[] | null;
}

export interface McpVertexFsWriteOutput {
	path: string;
	ok: boolean;
	bytesWritten: number;
	error?: string;
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
	pluginDiagnostic?: {
		requested: string[];
		loaded: string[];
		missing: string[];
		missingReasons?: Record<string, string>;
		configPlugins: string[];
		errors: number;
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
	blueprint: {
		serverName: string;
		namespacePrefix: string;
		projectType: "library" | "cli" | "webapp" | "game" | "monorepo" | "generic";
		plugins: string[];
		tools: {
			name: string;
			description: string;
		}[];
		prompts: {
			name: string;
			description: string;
		}[];
		skills: {
			name: string;
			description: string;
		}[];
		agents: {
			slot: string;
			description: string;
		}[];
		tests: boolean;
		hasExistingServer: boolean;
		defaults: {
			keepLegacy: boolean;
			reasons: string[];
			warnings: string[];
		};
		notes: string[];
	};
	files: {
		path: string;
		content: string;
	}[];
}

export interface McpVertexScaffoldOutput {
	kind: "tool" | "prompt" | "skill" | "agent" | "host" | "plugin" | "client";
	dryRun: boolean;
	files: {
		path: string;
		content: string;
	}[];
	written: string[];
	skipped: string[];
	moved: string[];
	kept: string[];
	errors: string[];
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
	"mcp-vertex_fs_read": McpVertexFsReadOutput;
	"mcp-vertex_fs_write": McpVertexFsWriteOutput;
	"mcp-vertex_get_validation_matrix": McpVertexGetValidationMatrixOutput;
	"mcp-vertex_knowledge": McpVertexKnowledgeOutput;
	"mcp-vertex_metrics": McpVertexMetricsOutput;
	"mcp-vertex_overview": McpVertexOverviewOutput;
	"mcp-vertex_plan_mcp_project": McpVertexPlanMcpProjectOutput;
	"mcp-vertex_scaffold": McpVertexScaffoldOutput;
	"mcp-vertex_status": McpVertexStatusOutput;
}
