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

export interface DelendaiAdoptProjectOutput {
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

export interface DelendaiAgentCatalogOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface DelendaiAnalyzeProjectOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface DelendaiBrowserBrowserA11yOutput {
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

export interface DelendaiBrowserBrowserAssertOutput {
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

export interface DelendaiBrowserBrowserClickOutput {
	target: string;
	action: "click" | "fill";
	url: string;
	matched: number;
}

export interface DelendaiBrowserBrowserFillOutput {
	target: string;
	action: "click" | "fill";
	url: string;
	matched: number;
}

export type DelendaiBrowserBrowserOpenOutput = {
	url: string;
	title: string;
	html: string;
	status: "ok";
} | {
	url: string;
	status: "install-missing";
	hint: string;
};

export type DelendaiBrowserBrowserQueryOutput = {
	url: string;
	matches: string[];
	status: "ok";
} | {
	url: string;
	status: "install-missing";
	hint: string;
};

export type DelendaiBrowserBrowserScreenshotOutput = {
	url: string;
	path: string;
	status: "ok";
} | {
	url: string;
	status: "install-missing";
	hint: string;
};

export interface DelendaiBrowserBrowserVerifyPageOutput {
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

export interface DelendaiCompletionClearOutput {
	ok: boolean;
	cleared: boolean;
	taskId: string;
}

export interface DelendaiCompletionReportCompleteOutput {
	ok: boolean;
	record: {
		taskId: string;
		agent: string;
		summary: string;
		reviewEvidence: string;
		ts: string;
	};
}

export interface DelendaiCompletionStatusOutput {
	ok: boolean;
	records: {
		taskId: string;
		agent: string;
		summary: string;
		reviewEvidence: string;
		ts: string;
	}[];
}

export interface DelendaiConfigurationCenterOutput {
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

export type DelendaiContainerContainerBuildOutput = {
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

export type DelendaiContainerContainerInspectOutput = {
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

export interface DelendaiContainerContainerLintOutput {
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

export type DelendaiContainerContainerLogsOutput = {
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

export type DelendaiContainerK8sApplyOutput = {
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

export interface DelendaiCreatePluginOutput {
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

export interface DelendaiCreateProjectOutput {
	kind: "host" | "plugin" | "client" | "extension-host";
	files: {
		path: string;
		content: string;
	}[];
}

export interface DelendaiDiagramDiagramDepsOutput {
	mermaid: string;
	nodes: string[];
	edges: {
		from: string;
		to: string;
	}[];
	truncated?: boolean;
}

export interface DelendaiDiagramDiagramErdOutput {
	mermaid: string;
	tables: number;
	relationships: number;
}

export interface DelendaiDiagramDiagramModulesOutput {
	mermaid: string;
	nodes: string[];
	edges: {
		from: string;
		to: string;
	}[];
	packageRoot: string;
	truncated?: boolean;
}

export interface DelendaiDiagramDiagramProposalsOutput {
	mermaid: string;
	statuses: string[];
	edges: number;
	annotated: string[];
}

export interface DelendaiDriftCheckOutput {
	hasDrift: boolean;
	changes: Array<{
		kind: "script-added" | "script-dropped" | "framework-changed" | "language-changed" | "monorepo-changed" | "package-manager-changed" | "test-runner-changed" | "mcp-server-added" | "mcp-server-dropped" | "ci-changed" | "agent-config-changed";
		summary: string;
	}>;
	isFirstSnapshot: boolean;
	lastSnapshotAt: string | null;
	summary: string;
}

export interface DelendaiEnvEnvCheckOutput {
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

export interface DelendaiEnvEnvExplainsOutput {
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

export interface DelendaiFsReadOutput {
	path: string;
	found: boolean;
	content: string | null;
	totalLines: number | null;
	range: unknown[] | null;
}

export interface DelendaiFsWriteOutput {
	path: string;
	ok: boolean;
	bytesWritten: number;
	error?: string;
}

export interface DelendaiGetValidationMatrixOutput {
	scopes: Record<string, {
		command: string;
		expect: string;
	}[]>;
}

export interface DelendaiI18nI18nCheckOutput {
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

export interface DelendaiI18nI18nValidateOutput {
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

export interface DelendaiInitConfigOutput {
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

export interface DelendaiKnowledgeOutput {
	entries?: {
		id: string;
		title: string;
	}[];
	id?: string;
	title?: string;
	body?: string;
}

export interface DelendaiLinkCheckLinkCheckOutput {
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

export interface DelendaiMetricsOutput {
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

export interface DelendaiObservabilityObsCorrelateOutput {
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

export interface DelendaiObservabilityObsErrorsOutput {
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

export interface DelendaiObservabilityObsReleaseHealthOutput {
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

export interface DelendaiObservabilityObsRuntimeMetricsOutput {
	calls: number;
	responses: {
		hasSamples: false;
	} | {
		hasSamples: true;
		p95PayloadBytes: number;
	};
}

export interface DelendaiObservabilityObsTraceOutput {
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

export interface DelendaiOverviewOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface DelendaiPerfPerfBenchOutput {
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

export interface DelendaiPerfPerfBundleOutput {
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

export type DelendaiPerfPerfProfileOutput = {
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

export interface DelendaiPlanMcpProjectOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface DelendaiPluginActivateOutput {
	change: {
		pluginId: string;
		namespace: string;
		active: boolean;
		changedToolNames: string[];
		visibleToolNames: string[];
		note?: string;
	} | null;
}

export interface DelendaiPluginAddOutput {
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

export interface DelendaiPluginDeactivateOutput {
	change: {
		pluginId: string;
		namespace: string;
		active: boolean;
		changedToolNames: string[];
		visibleToolNames: string[];
		note?: string;
	} | null;
}

export interface DelendaiPluginSearchOutput {
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

export interface DelendaiProjectContextOutput {
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

export interface DelendaiProjectPluginsCreateOutput {
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

export interface DelendaiProjectPluginsInspectOutput {
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

export interface DelendaiProjectPluginsRepairOutput {
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

export interface DelendaiPromptEvalEvalReportOutput {
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

export interface DelendaiPromptEvalEvalRunOutput {
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

export interface DelendaiRefactorRefactorApplyOutput {
	written: string[];
	gateCommand: string;
	consentToken: string;
}

export interface DelendaiRefactorRefactorCodemodOutput {
	files: {
		path: string;
		diff: string;
	}[];
	totalEdits: number;
	language: string;
}

export interface DelendaiRefactorRefactorDefinitionOutput {
	hit: {
		file: string;
		line: number;
		column: number;
		kind: string;
		name: string;
		isDefinition: boolean;
	} | null;
}

export interface DelendaiRefactorRefactorReferencesOutput {
	hits: {
		file: string;
		line: number;
		column: number;
		kind: string;
		name: string;
		isDefinition: boolean;
	}[];
}

export interface DelendaiRefactorRefactorRenameOutput {
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

export interface DelendaiRefactorRefactorSymbolsOutput {
	hits: {
		file: string;
		line: number;
		column: number;
		kind: string;
		name: string;
		isDefinition: boolean;
	}[];
}

export interface DelendaiScaffoldOutput {
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

export interface DelendaiSecuritySecurityAuditOutput {
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

export interface DelendaiSecuritySecurityDepsOutput {
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

export interface DelendaiSecuritySecuritySastOutput {
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

export interface DelendaiSecuritySecuritySecretsOutput {
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

export interface DelendaiSkillOutput {
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

export interface DelendaiStatusOutput {
	collectors: Record<string, unknown>;
	errors: {
		id: string;
		error: string;
	}[];
}

export interface DelendaiTechDebtDebtScanOutput {
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

export interface DelendaiToolSearchOutput {
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

export interface DelendaiUsageTrackingSessionHygieneOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface DelendaiUsageTrackingUsageClearOutput {
	ok: true;
	cleared: string[];
}

export interface DelendaiUsageTrackingUsageReportOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface DelendaiVertexOutput {
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
export interface DelendaiToolOutputs {
	"delendai_adopt_project": DelendaiAdoptProjectOutput;
	"delendai_agent_catalog": DelendaiAgentCatalogOutput;
	"delendai_analyze_project": DelendaiAnalyzeProjectOutput;
	"delendai_browser_browser_a11y": DelendaiBrowserBrowserA11yOutput;
	"delendai_browser_browser_assert": DelendaiBrowserBrowserAssertOutput;
	"delendai_browser_browser_click": DelendaiBrowserBrowserClickOutput;
	"delendai_browser_browser_fill": DelendaiBrowserBrowserFillOutput;
	"delendai_browser_browser_open": DelendaiBrowserBrowserOpenOutput;
	"delendai_browser_browser_query": DelendaiBrowserBrowserQueryOutput;
	"delendai_browser_browser_screenshot": DelendaiBrowserBrowserScreenshotOutput;
	"delendai_browser_browser_verify_page": DelendaiBrowserBrowserVerifyPageOutput;
	"delendai_completion_clear": DelendaiCompletionClearOutput;
	"delendai_completion_report_complete": DelendaiCompletionReportCompleteOutput;
	"delendai_completion_status": DelendaiCompletionStatusOutput;
	"delendai_configuration_center": DelendaiConfigurationCenterOutput;
	"delendai_container_container_build": DelendaiContainerContainerBuildOutput;
	"delendai_container_container_inspect": DelendaiContainerContainerInspectOutput;
	"delendai_container_container_lint": DelendaiContainerContainerLintOutput;
	"delendai_container_container_logs": DelendaiContainerContainerLogsOutput;
	"delendai_container_k8s_apply": DelendaiContainerK8sApplyOutput;
	"delendai_create_plugin": DelendaiCreatePluginOutput;
	"delendai_create_project": DelendaiCreateProjectOutput;
	"delendai_diagram_diagram_deps": DelendaiDiagramDiagramDepsOutput;
	"delendai_diagram_diagram_erd": DelendaiDiagramDiagramErdOutput;
	"delendai_diagram_diagram_modules": DelendaiDiagramDiagramModulesOutput;
	"delendai_diagram_diagram_proposals": DelendaiDiagramDiagramProposalsOutput;
	"delendai_drift_check": DelendaiDriftCheckOutput;
	"delendai_env_env_check": DelendaiEnvEnvCheckOutput;
	"delendai_env_env_explains": DelendaiEnvEnvExplainsOutput;
	"delendai_fs_read": DelendaiFsReadOutput;
	"delendai_fs_write": DelendaiFsWriteOutput;
	"delendai_get_validation_matrix": DelendaiGetValidationMatrixOutput;
	"delendai_i18n_i18n_check": DelendaiI18nI18nCheckOutput;
	"delendai_i18n_i18n_validate": DelendaiI18nI18nValidateOutput;
	"delendai_init_config": DelendaiInitConfigOutput;
	"delendai_knowledge": DelendaiKnowledgeOutput;
	"delendai_link-check_link_check": DelendaiLinkCheckLinkCheckOutput;
	"delendai_metrics": DelendaiMetricsOutput;
	"delendai_observability_obs_correlate": DelendaiObservabilityObsCorrelateOutput;
	"delendai_observability_obs_errors": DelendaiObservabilityObsErrorsOutput;
	"delendai_observability_obs_release_health": DelendaiObservabilityObsReleaseHealthOutput;
	"delendai_observability_obs_runtime_metrics": DelendaiObservabilityObsRuntimeMetricsOutput;
	"delendai_observability_obs_trace": DelendaiObservabilityObsTraceOutput;
	"delendai_overview": DelendaiOverviewOutput;
	"delendai_perf_perf_bench": DelendaiPerfPerfBenchOutput;
	"delendai_perf_perf_bundle": DelendaiPerfPerfBundleOutput;
	"delendai_perf_perf_profile": DelendaiPerfPerfProfileOutput;
	"delendai_plan_mcp_project": DelendaiPlanMcpProjectOutput;
	"delendai_plugin_activate": DelendaiPluginActivateOutput;
	"delendai_plugin_add": DelendaiPluginAddOutput;
	"delendai_plugin_deactivate": DelendaiPluginDeactivateOutput;
	"delendai_plugin_search": DelendaiPluginSearchOutput;
	"delendai_project_context": DelendaiProjectContextOutput;
	"delendai_project_plugins_create": DelendaiProjectPluginsCreateOutput;
	"delendai_project_plugins_inspect": DelendaiProjectPluginsInspectOutput;
	"delendai_project_plugins_repair": DelendaiProjectPluginsRepairOutput;
	"delendai_prompt-eval_eval_report": DelendaiPromptEvalEvalReportOutput;
	"delendai_prompt-eval_eval_run": DelendaiPromptEvalEvalRunOutput;
	"delendai_refactor_refactor_apply": DelendaiRefactorRefactorApplyOutput;
	"delendai_refactor_refactor_codemod": DelendaiRefactorRefactorCodemodOutput;
	"delendai_refactor_refactor_definition": DelendaiRefactorRefactorDefinitionOutput;
	"delendai_refactor_refactor_references": DelendaiRefactorRefactorReferencesOutput;
	"delendai_refactor_refactor_rename": DelendaiRefactorRefactorRenameOutput;
	"delendai_refactor_refactor_symbols": DelendaiRefactorRefactorSymbolsOutput;
	"delendai_scaffold": DelendaiScaffoldOutput;
	"delendai_security_security_audit": DelendaiSecuritySecurityAuditOutput;
	"delendai_security_security_deps": DelendaiSecuritySecurityDepsOutput;
	"delendai_security_security_sast": DelendaiSecuritySecuritySastOutput;
	"delendai_security_security_secrets": DelendaiSecuritySecuritySecretsOutput;
	"delendai_skill": DelendaiSkillOutput;
	"delendai_status": DelendaiStatusOutput;
	"delendai_tech-debt_debt_scan": DelendaiTechDebtDebtScanOutput;
	"delendai_tool_search": DelendaiToolSearchOutput;
	"delendai_usage-tracking_session_hygiene": DelendaiUsageTrackingSessionHygieneOutput;
	"delendai_usage-tracking_usage_clear": DelendaiUsageTrackingUsageClearOutput;
	"delendai_usage-tracking_usage_report": DelendaiUsageTrackingUsageReportOutput;
	"delendai_vertex": DelendaiVertexOutput;
}
