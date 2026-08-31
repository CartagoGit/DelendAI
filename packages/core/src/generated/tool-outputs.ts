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

export interface McpVertexAdoptProjectOutput {
	ok: true;
	preset: "lean" | "standard" | "minimal" | "swarm";
	stage?: "core" | "standard" | "agents" | "specialized";
	config?: Record<string, unknown>;
	rationale?: string[];
	assessment?: {
		recommendedPresetId: string;
		recommendedPluginIds: string[];
		pluginRecommendations: {
			id: string;
			recommended: boolean;
			rationale: string;
		}[];
		conflicts: Array<{
			kind: "existing-surface" | "write-estimate";
			summary: string;
			severity: "info" | "warning";
			count?: number;
			exact: boolean;
			breakdown?: Array<{
				kind: "config" | "proposal-store" | "generated";
				description: string;
				count?: number;
				exact: boolean;
			}>;
		}>;
		cost: {
			presetId: string;
			schemaBytes: number;
			estimatedTokens: number;
			recommendedPluginCount: number;
			source: "preset-budget" | "fallback-budget" | "plugin-budget";
			runtimeSurface?: "managed" | "native" | "adaptive" | "compact";
			note: string;
		};
		summary: {
			projectType: "library" | "cli" | "webapp" | "game" | "monorepo" | "generic";
			language: "typescript" | "javascript" | "python" | "go" | "rust" | "unknown";
			packageManager: "bun" | "pnpm" | "yarn" | "npm" | "unknown";
			ciProvider: "github-actions" | "gitlab-ci" | "circleci" | "unknown";
			docsConventions: string[];
		};
	};
	wrote: boolean;
	created: string[];
	skipped: string[];
	residual: string[];
}

export interface McpVertexAgentCatalogOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface McpVertexAnalyzeProjectOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface McpVertexBrowserBrowserA11yOutput {
	url: string;
	findings: Array<{
		ruleId: string;
		severity: "critical" | "high" | "medium" | "low" | "info";
		message: string;
		location?: {
			file: string;
			line?: number;
			endLine?: number;
		};
		fix?: string;
	}>;
	summary: Record<string, number>;
	worst: "critical" | "high" | "medium" | "low" | "info" | "none";
}

export interface McpVertexBrowserBrowserAssertOutput {
	url: string;
	passed: boolean;
	findings: Array<{
		ruleId: string;
		severity: "critical" | "high" | "medium" | "low" | "info";
		message: string;
		location?: {
			file: string;
			line?: number;
			endLine?: number;
		};
		fix?: string;
	}>;
}

export interface McpVertexBrowserBrowserClickOutput {
	target: string;
	action: "click" | "fill";
	url: string;
	matched: number;
}

export interface McpVertexBrowserBrowserFillOutput {
	target: string;
	action: "click" | "fill";
	url: string;
	matched: number;
}

export type McpVertexBrowserBrowserOpenOutput = {
	url: string;
	title: string;
	html: string;
	status: "ok";
} | {
	url: string;
	status: "install-missing";
	hint: string;
};

export type McpVertexBrowserBrowserQueryOutput = {
	url: string;
	matches: string[];
	status: "ok";
} | {
	url: string;
	status: "install-missing";
	hint: string;
};

export type McpVertexBrowserBrowserScreenshotOutput = {
	url: string;
	path: string;
	status: "ok";
} | {
	url: string;
	status: "install-missing";
	hint: string;
};

export interface McpVertexBrowserBrowserVerifyPageOutput {
	url: string;
	ok: boolean;
	checks: {
		html: boolean;
		stylesheet: boolean;
		nav: boolean;
	};
	mode: "real" | "fixture";
	installHint?: string;
}

export interface McpVertexCompletionClearOutput {
	ok: boolean;
	cleared: boolean;
	taskId: string;
}

export interface McpVertexCompletionReportCompleteOutput {
	ok: boolean;
	record: {
		taskId: string;
		agent: string;
		summary: string;
		reviewEvidence: string;
		ts: string;
	};
}

export interface McpVertexCompletionStatusOutput {
	ok: boolean;
	records: {
		taskId: string;
		agent: string;
		summary: string;
		reviewEvidence: string;
		ts: string;
	}[];
}

export interface McpVertexConfigurationCenterOutput {
	section: "summary" | "config" | "plugins" | "artifacts";
	page: {
		cursor: number;
		nextCursor: number | null;
		total: number;
	};
	summary?: {
		plugins: number;
		activePlugins: number;
		artifacts: number;
		unavailableArtifactKinds: Array<"agent" | "skill" | "prompt" | "resource" | "knowledge">;
		env?: {
			pluginLoaded: boolean;
			pathsChecked: string[];
			missingRequired: string[];
			blockedCapabilities: {
				plugin: string;
				capability: string;
				missing: string[];
			}[];
		};
	};
	configSchema?: Record<string, unknown>;
	config?: Record<string, unknown>;
	redactions?: number;
	plugins?: Array<{
		id: string;
		origin: "bundled" | "user-local" | "external";
		active: boolean;
		source: "preset" | "config" | "flag";
		path?: string;
		prefix?: string;
		options: Record<string, unknown>;
		optionsSchema?: Record<string, unknown>;
		schemaStatus: "available" | "unavailable";
		configExample?: Record<string, unknown>;
		permissions?: Array<"filesystem-read" | "filesystem-write" | "process" | "network" | "git-read" | "git-write" | "forge-read" | "forge-write" | "env-read" | "secrets" | "browser" | "container" | "database">;
		capabilities: {
			tools: number;
			prompts: number;
			resources: number;
			knowledge: number;
			skills: number;
		};
	}>;
	artifacts?: Array<{
		id: string;
		kind: "agent" | "skill" | "prompt" | "resource" | "knowledge";
		owner: {
			id: string | null;
			origin: "bundled" | "user-local" | "external" | "unknown";
		};
	}>;
}

export type McpVertexContainerContainerBuildOutput = {
	ok: true;
	command: string;
	exitCode: number;
	imageId?: string;
} | {
	ok: false;
	reason: string;
	nextAction: string;
} | {
	ok: "dry-run";
	command: string;
} | {
	ok: false;
	isError: true;
	error: {
		reason: "install-missing";
		nextAction?: string;
	};
};

export type McpVertexContainerContainerInspectOutput = {
	ok: true;
	kind: "docker-ps";
	items: {
		id: string;
		name: string;
		image: string;
		status: string;
		ports: string[];
		createdAt: string;
	}[];
} | {
	ok: true;
	kind: "docker-images";
	items: {
		id: string;
		repository: string;
		tag: string;
		size: string;
		createdAt: string;
	}[];
} | {
	ok: true;
	kind: "k8s-get";
	items: {
		name: string;
		namespace: string;
		status: string;
		nodeName?: string;
		podIp?: string;
		containers: string[];
	}[];
} | {
	ok: "skipped";
	hint: string;
};

export interface McpVertexContainerContainerLintOutput {
	ok: true;
	findings: Array<{
		ruleId: string;
		severity: "critical" | "high" | "medium" | "low" | "info";
		message: string;
		fix?: string;
		location: {
			file: string;
			line: number;
		};
	}>;
}

export type McpVertexContainerContainerLogsOutput = {
	ok: true;
	container: string;
	lines: Array<{
		timestamp: string;
		stream: "stdout" | "stderr" | "unknown";
		message: string;
	}>;
} | {
	ok: "skipped";
	hint: string;
};

export type McpVertexContainerK8sApplyOutput = {
	ok: true;
	command: string;
	exitCode: number;
} | {
	ok: false;
	reason: string;
	nextAction: string;
} | {
	ok: "dry-run";
	command: string;
} | {
	ok: false;
	isError: true;
	error: {
		reason: "install-missing";
		nextAction?: string;
	};
};

export interface McpVertexCreatePluginOutput {
	ok: boolean;
	scaffolded: {
		files: string[];
	};
	wired: Array<{
		pointId: "tsconfig-base" | "vitest-shared" | "plugin-defaults" | "publish-order" | "preset-catalog" | "catalog-regen";
		edits: {
			path: string;
			previous: string;
			next: string;
			noop: boolean;
		}[];
		wired: boolean;
	}>;
	doctor: {
		pluginId: string;
		points: Array<{
			id: "tsconfig-base" | "vitest-shared" | "plugin-defaults" | "publish-order" | "preset-catalog" | "catalog-regen";
			path: string;
			wired: boolean;
			summary: string;
			remediation?: string;
		}>;
		loadDiagnostics: {
			pluginId: string;
			reason: string;
			fixHint: string;
		}[];
		fullyWired: boolean;
		missing: Array<"tsconfig-base" | "vitest-shared" | "plugin-defaults" | "publish-order" | "preset-catalog" | "catalog-regen">;
	};
	pluginId: string;
}

export interface McpVertexCreateProjectOutput {
	kind: "host" | "plugin" | "client" | "extension-host";
	files: {
		path: string;
		content: string;
	}[];
}

export interface McpVertexDiagramDiagramDepsOutput {
	mermaid: string;
	nodes: string[];
	edges: {
		from: string;
		to: string;
	}[];
	truncated?: boolean;
}

export interface McpVertexDiagramDiagramErdOutput {
	mermaid: string;
	tables: number;
	relationships: number;
}

export interface McpVertexDiagramDiagramModulesOutput {
	mermaid: string;
	nodes: string[];
	edges: {
		from: string;
		to: string;
	}[];
	packageRoot: string;
	truncated?: boolean;
}

export interface McpVertexDiagramDiagramProposalsOutput {
	mermaid: string;
	statuses: string[];
	edges: number;
	annotated: string[];
}

export interface McpVertexDriftCheckOutput {
	hasDrift: boolean;
	changes: Array<{
		kind: "script-added" | "script-dropped" | "framework-changed" | "language-changed" | "monorepo-changed" | "package-manager-changed" | "test-runner-changed" | "mcp-server-added" | "mcp-server-dropped" | "ci-changed" | "agent-config-changed";
		summary: string;
	}>;
	isFirstSnapshot: boolean;
	lastSnapshotAt: string | null;
	summary: string;
}

export interface McpVertexEnvEnvCheckOutput {
	found: boolean;
	path: string;
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

export interface McpVertexEnvEnvExplainsOutput {
	found: boolean;
	path: string;
	explain: {
		capabilities: Array<{
			plugin: string;
			capability: string;
			provider?: string;
			satisfiedBy: string[];
		} | {
			plugin: string;
			capability: string;
			provider?: string;
			missing: string[];
		}>;
		blocked: {
			plugin: string;
			capability: string;
			provider?: string;
			missing: string[];
		}[];
		unlocked: {
			plugin: string;
			capability: string;
			provider?: string;
			satisfiedBy: string[];
		}[];
		completelyMissing: string[];
	};
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

export interface McpVertexI18nI18nCheckOutput {
	localesDir: string;
	locales: string[];
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

export interface McpVertexI18nI18nValidateOutput {
	localesDir: string;
	sourceLocale: string;
	locales: string[];
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

export interface McpVertexInitConfigOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
	};
	preset?: "lean" | "standard" | "minimal" | "swarm";
	config?: Record<string, unknown>;
	rationale?: string[];
	wrote?: boolean;
	path?: string;
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

export interface McpVertexLinkCheckLinkCheckOutput {
	docsScanned: number;
	total: number;
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
	truncated: boolean;
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	worst: string;
}

export interface McpVertexMetricsOutput {
	tools: Record<string, {
		calls: number;
		errors: number;
		totalMs: number;
		maxMs: number;
		totalBytes: number;
		cost: {
			contentTextBytes: number;
			structuredJsonBytes: number;
			wireEstimateBytes: number;
			estimatedTokens: {
				estimatedTokens4B: number;
				actualModelTokens?: number;
			};
		};
	}>;
	totals: {
		calls: number;
		errors: number;
		totalMs: number;
		totalBytes: number;
		cost: {
			contentTextBytes: number;
			structuredJsonBytes: number;
			wireEstimateBytes: number;
			estimatedTokens: {
				estimatedTokens4B: number;
				actualModelTokens?: number;
			};
		};
	};
	persistedTo?: string;
	snapshots?: number;
}

export interface McpVertexObservabilityObsCorrelateOutput {
	matches: {
		issueId: string;
		logFile: string;
		line: number;
		summary: string;
	}[];
	totalIssues: number;
	totalLogs: number;
	summary: string;
}

export interface McpVertexObservabilityObsErrorsOutput {
	source: "sentry" | "datadog" | "custom";
	issues: Array<{
		id: string;
		title: string;
		project: string;
		level: "fatal" | "error" | "warning" | "info" | "debug" | "unknown";
		lastSeen: string;
		eventCount: number;
		context: string;
		url: string;
	}>;
	nextCursor: string | null;
	redactions: number;
}

export interface McpVertexObservabilityObsReleaseHealthOutput {
	versions: {
		version: string;
		totalSessions: number;
		crashCount: number;
		crashFreeRate: number;
	}[];
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	worst: "critical" | "high" | "medium" | "low" | "info" | null;
}

export interface McpVertexObservabilityObsRuntimeMetricsOutput {
	calls: number;
	responses: {
		hasSamples: false;
	} | {
		hasSamples: true;
		p95PayloadBytes: number;
	};
}

export interface McpVertexObservabilityObsTraceOutput {
	sampleSize: number;
	groups: Array<{
		service: string;
		traceId: string;
		hourBucket: string;
		count: number;
		errorRate: number;
		topError: string | null;
	}>;
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	worst: "critical" | "high" | "medium" | "low" | "info" | null;
}

export interface McpVertexOverviewOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface McpVertexPerfPerfBenchOutput {
	results: {
		name: string;
		ops: number;
		sampleCount: number;
		meanMs: number;
		p95Ms: number;
	}[];
	regressions: {
		name: string;
		baselineOps: number;
		currentOps: number;
		ratio: number;
		threshold: number;
	}[];
}

export interface McpVertexPerfPerfBundleOutput {
	globs: string[];
	fileCount: number;
	totalBytes: number;
	largest: {
		path: string;
		bytes: number;
	}[];
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

export type McpVertexPerfPerfProfileOutput = {
	ok: true;
	profiler: string;
	hotspots: Array<{
		name: string;
		message: string;
		severity: "high" | "medium" | "low" | "info";
		selfPercent: number;
		totalPercent: number;
		samples: number;
	}>;
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	worst: string;
} | {
	ok: "skipped";
	hint: string;
};

export interface McpVertexPlanMcpProjectOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface McpVertexPluginActivateOutput {
	change: {
		pluginId: string;
		namespace: string;
		active: boolean;
		changedToolNames: string[];
		visibleToolNames: string[];
		note?: string;
	} | null;
}

export interface McpVertexPluginAddOutput {
	entry: {
		id: string;
		package: string;
		summary: string;
		tags: string[];
		origin: "first-party" | "community";
		defaultPreset?: "minimal" | "lean" | "standard" | "swarm" | "full" | "vertex";
	};
	steps: Array<{
		kind: "install" | "wire" | "config";
		summary: string;
		detail: Record<string, unknown>;
	}>;
	alreadyAdopted: boolean;
}

export interface McpVertexPluginDeactivateOutput {
	change: {
		pluginId: string;
		namespace: string;
		active: boolean;
		changedToolNames: string[];
		visibleToolNames: string[];
		note?: string;
	} | null;
}

export interface McpVertexPluginSearchOutput {
	entries: Array<{
		id: string;
		package: string;
		summary: string;
		tags: string[];
		origin: "first-party" | "community";
		defaultPreset?: "minimal" | "lean" | "standard" | "swarm" | "full" | "vertex";
	}>;
	total: number;
	truncated: boolean;
}

export interface McpVertexProjectContextOutput {
	surfaceMode: "managed" | "native" | "adaptive" | "compact";
	workspaceRoot: string;
	cacheDir?: string;
	docsDir?: string;
	configIssues: string[];
	loadedPlugins: string[];
	warmPlugins?: string[];
	visibleToolCount: number;
	hiddenToolCount: number;
	visibleDomains: string[];
}

export interface McpVertexProjectPluginsCreateOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
	};
	name?: string;
	namespace?: string;
	pluginDir?: string;
	pluginPath?: string;
	files?: {
		written: string[];
		preserved: string[];
		moved: string[];
		planned: {
			path: string;
			content: string;
		}[];
	};
	registration?: {
		configFile: string;
		path: string;
		action: "added" | "updated" | "unchanged";
		previousPath?: string;
	};
	diagnostics?: Array<{
		id: string;
		severity: "error" | "warning" | "info";
		path: string;
		message: string;
		action: string;
		autoFixable: boolean;
	}>;
	autoFixed?: string[];
	nextSteps?: string;
}

export interface McpVertexProjectPluginsInspectOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
	};
	name?: string;
	namespace?: string;
	pluginDir?: string;
	pluginPath?: string;
	files?: {
		written: string[];
		preserved: string[];
		moved: string[];
		planned: {
			path: string;
			content: string;
		}[];
	};
	registration?: {
		configFile: string;
		path: string;
		action: "added" | "updated" | "unchanged";
		previousPath?: string;
	};
	diagnostics?: Array<{
		id: string;
		severity: "error" | "warning" | "info";
		path: string;
		message: string;
		action: string;
		autoFixable: boolean;
	}>;
	autoFixed?: string[];
	nextSteps?: string;
}

export interface McpVertexProjectPluginsRepairOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
	};
	name?: string;
	namespace?: string;
	pluginDir?: string;
	pluginPath?: string;
	files?: {
		written: string[];
		preserved: string[];
		moved: string[];
		planned: {
			path: string;
			content: string;
		}[];
	};
	registration?: {
		configFile: string;
		path: string;
		action: "added" | "updated" | "unchanged";
		previousPath?: string;
	};
	diagnostics?: Array<{
		id: string;
		severity: "error" | "warning" | "info";
		path: string;
		message: string;
		action: string;
		autoFixable: boolean;
	}>;
	autoFixed?: string[];
	nextSteps?: string;
}

export interface McpVertexPromptEvalEvalReportOutput {
	tool: "eval_report";
	rows: Array<{
		providerId: string;
		costTier: number;
		attempts: number;
		passes: number;
		winRate: number | null;
		totalCostUsd: number;
		compositeScore: number;
	}>;
	winner: string | null;
	worst: string | null;
	totalCostUsd: number;
	totalPasses: number;
	markdown: string;
}

export interface McpVertexPromptEvalEvalRunOutput {
	tool: "eval_run";
	taskType: string | null;
	attempts: {
		providerId: string;
		costTier: number;
		costUsd: number;
		passed: boolean;
		skipped?: "spend-denied";
	}[];
	passed: number;
	totalCostUsd: number;
	winner: string | null;
}

export interface McpVertexRefactorRefactorApplyOutput {
	written: string[];
	gateCommand: string;
	consentToken: string;
}

export interface McpVertexRefactorRefactorCodemodOutput {
	files: {
		path: string;
		diff: string;
	}[];
	totalEdits: number;
	language: string;
}

export interface McpVertexRefactorRefactorDefinitionOutput {
	hit: {
		file: string;
		line: number;
		column: number;
		kind: string;
		name: string;
		isDefinition: boolean;
	} | null;
}

export interface McpVertexRefactorRefactorReferencesOutput {
	hits: {
		file: string;
		line: number;
		column: number;
		kind: string;
		name: string;
		isDefinition: boolean;
	}[];
}

export interface McpVertexRefactorRefactorRenameOutput {
	files: Array<{
		path: string;
		before: string;
		after: string;
		hunks: Array<{
			oldStart: number;
			oldLines: number;
			newStart: number;
			newLines: number;
			lines: Array<{
				kind: " " | "-" | "+";
				text: string;
			}>;
		}>;
	}>;
	totalEdits: number;
	ambiguous?: {
		path: string;
		line: number;
		candidates: {
			line: number;
			scope: string;
		}[];
	}[];
}

export interface McpVertexRefactorRefactorSymbolsOutput {
	hits: {
		file: string;
		line: number;
		column: number;
		kind: string;
		name: string;
		isDefinition: boolean;
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

export interface McpVertexSecuritySecurityAuditOutput {
	scanned: number;
	tools: string[];
	worst: string;
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
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
	skipped: {
		tool: string;
		note?: string;
	}[];
}

export interface McpVertexSecuritySecurityDepsOutput {
	ok: boolean;
	tool?: string;
	scanned?: number;
	findings?: Array<{
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
	summary?: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	worst?: string;
	error?: string;
	hint?: string;
}

export interface McpVertexSecuritySecuritySastOutput {
	tool: "sast";
	scanned: number;
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

export interface McpVertexSecuritySecuritySecretsOutput {
	tool: string;
	scanned: number;
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

export interface McpVertexSkillOutput {
	skills?: {
		id: string;
		version: string;
		description: string;
		appliesTo: string[];
		tags: string[];
		source?: string;
		owner?: string;
		hash?: string;
		estimatedBodyTokens?: number;
	}[];
	id?: string;
	body?: string;
}

export interface McpVertexStatusOutput {
	collectors: Record<string, unknown>;
	errors: {
		id: string;
		error: string;
	}[];
}

export interface McpVertexTechDebtDebtScanOutput {
	filesScanned: number;
	total: number;
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
	truncated: boolean;
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	worst: string;
}

export interface McpVertexToolSearchOutput {
	entries: {
		registrationId: string;
		name: string;
		toolId: string;
		pluginId?: string;
		namespace?: string;
		summary?: string;
		tags?: string[];
		active: boolean;
		detailsId: string;
	}[];
}

export interface McpVertexUsageTrackingSessionHygieneOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface McpVertexUsageTrackingUsageClearOutput {
	ok: true;
	cleared: string[];
}

export interface McpVertexUsageTrackingUsageReportOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface McpVertexVertexOutput {
	routed: true;
	domain: string;
	action: string;
	tool: string;
	active: boolean;
	isError: boolean;
	text?: string;
	structuredContent?: unknown;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface McpVertexToolOutputs {
	"mcp-vertex_adopt_project": McpVertexAdoptProjectOutput;
	"mcp-vertex_agent_catalog": McpVertexAgentCatalogOutput;
	"mcp-vertex_analyze_project": McpVertexAnalyzeProjectOutput;
	"mcp-vertex_browser_browser_a11y": McpVertexBrowserBrowserA11yOutput;
	"mcp-vertex_browser_browser_assert": McpVertexBrowserBrowserAssertOutput;
	"mcp-vertex_browser_browser_click": McpVertexBrowserBrowserClickOutput;
	"mcp-vertex_browser_browser_fill": McpVertexBrowserBrowserFillOutput;
	"mcp-vertex_browser_browser_open": McpVertexBrowserBrowserOpenOutput;
	"mcp-vertex_browser_browser_query": McpVertexBrowserBrowserQueryOutput;
	"mcp-vertex_browser_browser_screenshot": McpVertexBrowserBrowserScreenshotOutput;
	"mcp-vertex_browser_browser_verify_page": McpVertexBrowserBrowserVerifyPageOutput;
	"mcp-vertex_completion_clear": McpVertexCompletionClearOutput;
	"mcp-vertex_completion_report_complete": McpVertexCompletionReportCompleteOutput;
	"mcp-vertex_completion_status": McpVertexCompletionStatusOutput;
	"mcp-vertex_configuration_center": McpVertexConfigurationCenterOutput;
	"mcp-vertex_container_container_build": McpVertexContainerContainerBuildOutput;
	"mcp-vertex_container_container_inspect": McpVertexContainerContainerInspectOutput;
	"mcp-vertex_container_container_lint": McpVertexContainerContainerLintOutput;
	"mcp-vertex_container_container_logs": McpVertexContainerContainerLogsOutput;
	"mcp-vertex_container_k8s_apply": McpVertexContainerK8sApplyOutput;
	"mcp-vertex_create_plugin": McpVertexCreatePluginOutput;
	"mcp-vertex_create_project": McpVertexCreateProjectOutput;
	"mcp-vertex_diagram_diagram_deps": McpVertexDiagramDiagramDepsOutput;
	"mcp-vertex_diagram_diagram_erd": McpVertexDiagramDiagramErdOutput;
	"mcp-vertex_diagram_diagram_modules": McpVertexDiagramDiagramModulesOutput;
	"mcp-vertex_diagram_diagram_proposals": McpVertexDiagramDiagramProposalsOutput;
	"mcp-vertex_drift_check": McpVertexDriftCheckOutput;
	"mcp-vertex_env_env_check": McpVertexEnvEnvCheckOutput;
	"mcp-vertex_env_env_explains": McpVertexEnvEnvExplainsOutput;
	"mcp-vertex_fs_read": McpVertexFsReadOutput;
	"mcp-vertex_fs_write": McpVertexFsWriteOutput;
	"mcp-vertex_get_validation_matrix": McpVertexGetValidationMatrixOutput;
	"mcp-vertex_i18n_i18n_check": McpVertexI18nI18nCheckOutput;
	"mcp-vertex_i18n_i18n_validate": McpVertexI18nI18nValidateOutput;
	"mcp-vertex_init_config": McpVertexInitConfigOutput;
	"mcp-vertex_knowledge": McpVertexKnowledgeOutput;
	"mcp-vertex_link-check_link_check": McpVertexLinkCheckLinkCheckOutput;
	"mcp-vertex_metrics": McpVertexMetricsOutput;
	"mcp-vertex_observability_obs_correlate": McpVertexObservabilityObsCorrelateOutput;
	"mcp-vertex_observability_obs_errors": McpVertexObservabilityObsErrorsOutput;
	"mcp-vertex_observability_obs_release_health": McpVertexObservabilityObsReleaseHealthOutput;
	"mcp-vertex_observability_obs_runtime_metrics": McpVertexObservabilityObsRuntimeMetricsOutput;
	"mcp-vertex_observability_obs_trace": McpVertexObservabilityObsTraceOutput;
	"mcp-vertex_overview": McpVertexOverviewOutput;
	"mcp-vertex_perf_perf_bench": McpVertexPerfPerfBenchOutput;
	"mcp-vertex_perf_perf_bundle": McpVertexPerfPerfBundleOutput;
	"mcp-vertex_perf_perf_profile": McpVertexPerfPerfProfileOutput;
	"mcp-vertex_plan_mcp_project": McpVertexPlanMcpProjectOutput;
	"mcp-vertex_plugin_activate": McpVertexPluginActivateOutput;
	"mcp-vertex_plugin_add": McpVertexPluginAddOutput;
	"mcp-vertex_plugin_deactivate": McpVertexPluginDeactivateOutput;
	"mcp-vertex_plugin_search": McpVertexPluginSearchOutput;
	"mcp-vertex_project_context": McpVertexProjectContextOutput;
	"mcp-vertex_project_plugins_create": McpVertexProjectPluginsCreateOutput;
	"mcp-vertex_project_plugins_inspect": McpVertexProjectPluginsInspectOutput;
	"mcp-vertex_project_plugins_repair": McpVertexProjectPluginsRepairOutput;
	"mcp-vertex_prompt-eval_eval_report": McpVertexPromptEvalEvalReportOutput;
	"mcp-vertex_prompt-eval_eval_run": McpVertexPromptEvalEvalRunOutput;
	"mcp-vertex_refactor_refactor_apply": McpVertexRefactorRefactorApplyOutput;
	"mcp-vertex_refactor_refactor_codemod": McpVertexRefactorRefactorCodemodOutput;
	"mcp-vertex_refactor_refactor_definition": McpVertexRefactorRefactorDefinitionOutput;
	"mcp-vertex_refactor_refactor_references": McpVertexRefactorRefactorReferencesOutput;
	"mcp-vertex_refactor_refactor_rename": McpVertexRefactorRefactorRenameOutput;
	"mcp-vertex_refactor_refactor_symbols": McpVertexRefactorRefactorSymbolsOutput;
	"mcp-vertex_scaffold": McpVertexScaffoldOutput;
	"mcp-vertex_security_security_audit": McpVertexSecuritySecurityAuditOutput;
	"mcp-vertex_security_security_deps": McpVertexSecuritySecurityDepsOutput;
	"mcp-vertex_security_security_sast": McpVertexSecuritySecuritySastOutput;
	"mcp-vertex_security_security_secrets": McpVertexSecuritySecuritySecretsOutput;
	"mcp-vertex_skill": McpVertexSkillOutput;
	"mcp-vertex_status": McpVertexStatusOutput;
	"mcp-vertex_tech-debt_debt_scan": McpVertexTechDebtDebtScanOutput;
	"mcp-vertex_tool_search": McpVertexToolSearchOutput;
	"mcp-vertex_usage-tracking_session_hygiene": McpVertexUsageTrackingSessionHygieneOutput;
	"mcp-vertex_usage-tracking_usage_clear": McpVertexUsageTrackingUsageClearOutput;
	"mcp-vertex_usage-tracking_usage_report": McpVertexUsageTrackingUsageReportOutput;
	"mcp-vertex_vertex": McpVertexVertexOutput;
}
