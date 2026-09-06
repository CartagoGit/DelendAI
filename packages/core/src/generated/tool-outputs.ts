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

export interface IDelendaiAdoptProjectOutput {
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

export interface IDelendaiAgentCatalogOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface IDelendaiAnalyzeProjectOutput {
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

export interface IDelendaiBrowserBrowserAssertOutput {
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

export interface IDelendaiBrowserBrowserClickOutput {
	target: string;
	action: "click" | "fill";
	url: string;
	matched: number;
}

export interface IDelendaiBrowserBrowserFillOutput {
	target: string;
	action: "click" | "fill";
	url: string;
	matched: number;
}

export type IDelendaiBrowserBrowserOpenOutput = {
	url: string;
	title: string;
	html: string;
	status: "ok";
} | {
	url: string;
	status: "install-missing";
	hint: string;
};

export type IDelendaiBrowserBrowserQueryOutput = {
	url: string;
	matches: string[];
	status: "ok";
} | {
	url: string;
	status: "install-missing";
	hint: string;
};

export type IDelendaiBrowserBrowserScreenshotOutput = {
	url: string;
	path: string;
	status: "ok";
} | {
	url: string;
	status: "install-missing";
	hint: string;
};

export interface IDelendaiBrowserBrowserVerifyPageOutput {
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

export interface IDelendaiCompletionClearOutput {
	ok: boolean;
	cleared: boolean;
	taskId: string;
}

export interface IDelendaiCompletionReportCompleteOutput {
	ok: boolean;
	record: {
		taskId: string;
		agent: string;
		summary: string;
		reviewEvidence: string;
		ts: string;
	};
}

export interface IDelendaiCompletionStatusOutput {
	ok: boolean;
	records: {
		taskId: string;
		agent: string;
		summary: string;
		reviewEvidence: string;
		ts: string;
	}[];
}

export interface IDelendaiConfigurationCenterOutput {
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
			id: string;
			origin: "bundled" | "user-local" | "external" | "unknown";
		};
	}>;
}

export type IDelendaiContainerContainerBuildOutput = {
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

export type IDelendaiContainerContainerInspectOutput = {
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

export interface IDelendaiContainerContainerLintOutput {
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

export type IDelendaiContainerContainerLogsOutput = {
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

export interface IDelendaiCreatePluginOutput {
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

export interface IDelendaiCreateProjectOutput {
	kind: "host" | "plugin" | "client" | "extension-host";
	files: {
		path: string;
		content: string;
	}[];
}

export interface IDelendaiDiagramDiagramDepsOutput {
	mermaid: string;
	nodes: string[];
	edges: {
		from: string;
		to: string;
	}[];
	truncated?: boolean;
}

export interface IDelendaiDiagramDiagramErdOutput {
	mermaid: string;
	tables: number;
	relationships: number;
}

export interface IDelendaiDiagramDiagramModulesOutput {
	mermaid: string;
	nodes: string[];
	edges: {
		from: string;
		to: string;
	}[];
	packageRoot: string;
	truncated?: boolean;
}

export interface IDelendaiDiagramDiagramProposalsOutput {
	mermaid: string;
	statuses: string[];
	edges: number;
	annotated: string[];
}

export interface IDelendaiDriftCheckOutput {
	hasDrift: boolean;
	changes: Array<{
		kind: "script-added" | "script-dropped" | "framework-changed" | "language-changed" | "monorepo-changed" | "package-manager-changed" | "test-runner-changed" | "mcp-server-added" | "mcp-server-dropped" | "ci-changed" | "agent-config-changed";
		summary: string;
	}>;
	isFirstSnapshot: boolean;
	lastSnapshotAt: string;
	summary: string;
}

export interface IDelendaiEnvEnvCheckOutput {
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

export interface IDelendaiEnvEnvExplainsOutput {
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

export interface IDelendaiFsReadOutput {
	path: string;
	found: boolean;
	content: string;
	totalLines: number;
	range: never[] | null;
}

export interface IDelendaiFsWriteOutput {
	path: string;
	ok: boolean;
	bytesWritten: number;
	error?: string;
}

export interface IDelendaiGetValidationMatrixOutput {
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

export interface IDelendaiInitConfigOutput {
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

export interface IDelendaiKnowledgeOutput {
	entries?: {
		id: string;
		title: string;
	}[];
	id?: string;
	title?: string;
	body?: string;
}

export interface IDelendaiLinkCheckLinkCheckOutput {
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

export interface IDelendaiMetricsOutput {
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

export interface IDelendaiObservabilityObsCorrelateOutput {
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

export interface IDelendaiObservabilityObsErrorsOutput {
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
	nextCursor: string;
	redactions: number;
}

export interface IDelendaiObservabilityObsReleaseHealthOutput {
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

export interface IDelendaiObservabilityObsRuntimeMetricsOutput {
	calls: number;
	responses: {
		hasSamples: false;
	} | {
		hasSamples: true;
		p95PayloadBytes: number;
	};
}

export interface IDelendaiObservabilityObsTraceOutput {
	sampleSize: number;
	groups: {
		service: string;
		traceId: string;
		hourBucket: string;
		count: number;
		errorRate: number;
		topError: string;
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

export interface IDelendaiOverviewOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface IDelendaiPerfPerfBenchOutput {
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

export interface IDelendaiPerfPerfBundleOutput {
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

export type IDelendaiPerfPerfProfileOutput = {
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

export interface IDelendaiPlanMcpProjectOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface IDelendaiPluginActivateOutput {
	change: {
		pluginId: string;
		namespace: string;
		active: boolean;
		changedToolNames: string[];
		visibleToolNames: string[];
		note?: string;
	} | null;
}

export interface IDelendaiPluginAddOutput {
	entry: {
		id: string;
		package: string;
		summary: string;
		tags: string[];
		origin: "first-party" | "community";
		defaultPreset?: "minimal" | "lean" | "standard" | "swarm" | "full" | "dogfood" | "web-app" | "backend-api" | "cli-tool" | "vertex";
	};
	steps: Array<{
		kind: "install" | "wire" | "config";
		summary: string;
		detail: Record<string, unknown>;
	}>;
	alreadyAdopted: boolean;
}

export interface IDelendaiPluginDeactivateOutput {
	change: {
		pluginId: string;
		namespace: string;
		active: boolean;
		changedToolNames: string[];
		visibleToolNames: string[];
		note?: string;
	} | null;
}

export interface IDelendaiPluginSearchOutput {
	entries: Array<{
		id: string;
		package: string;
		summary: string;
		tags: string[];
		origin: "first-party" | "community";
		defaultPreset?: "minimal" | "lean" | "standard" | "swarm" | "full" | "dogfood" | "web-app" | "backend-api" | "cli-tool" | "vertex";
	}>;
	total: number;
	truncated: boolean;
}

export interface IDelendaiProjectContextOutput {
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

export interface IDelendaiProjectPluginsCreateOutput {
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

export interface IDelendaiProjectPluginsInspectOutput {
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

export interface IDelendaiProjectPluginsRepairOutput {
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

export interface IDelendaiPromptEvalEvalReportOutput {
	tool: "eval_report";
	rows: {
		providerId: string;
		costTier: number;
		attempts: number;
		passes: number;
		winRate: number;
		totalCostUsd: number;
		compositeScore: number;
	}[];
	winner: string;
	worst: string;
	totalCostUsd: number;
	totalPasses: number;
	markdown: string;
}

export interface IDelendaiPromptEvalEvalRunOutput {
	tool: "eval_run";
	taskType: string;
	attempts: {
		providerId: string;
		costTier: number;
		costUsd: number;
		passed: boolean;
		skipped?: "spend-denied";
	}[];
	passed: number;
	totalCostUsd: number;
	winner: string;
}

export interface IDelendaiRefactorRefactorApplyOutput {
	written: string[];
	gateCommand: string;
	consentToken: string;
}

export interface IDelendaiRefactorRefactorCodemodOutput {
	files: {
		path: string;
		diff: string;
	}[];
	totalEdits: number;
	language: string;
}

export interface IDelendaiRefactorRefactorDefinitionOutput {
	hit: {
		file: string;
		line: number;
		column: number;
		kind: string;
		name: string;
		isDefinition: boolean;
	} | null;
}

export interface IDelendaiRefactorRefactorReferencesOutput {
	hits: {
		file: string;
		line: number;
		column: number;
		kind: string;
		name: string;
		isDefinition: boolean;
	}[];
}

export interface IDelendaiRefactorRefactorRenameOutput {
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

export interface IDelendaiRefactorRefactorSymbolsOutput {
	hits: {
		file: string;
		line: number;
		column: number;
		kind: string;
		name: string;
		isDefinition: boolean;
	}[];
}

export interface IDelendaiScaffoldOutput {
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

export interface IDelendaiSecuritySecurityAuditOutput {
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

export interface IDelendaiSecuritySecurityDepsOutput {
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

export interface IDelendaiSecuritySecuritySastOutput {
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

export interface IDelendaiSecuritySecuritySecretsOutput {
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

export interface IDelendaiSkillOutput {
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

export interface IDelendaiStatusOutput {
	collectors: Record<string, unknown>;
	errors: {
		id: string;
		error: string;
	}[];
}

export interface IDelendaiTechDebtDebtScanOutput {
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

export interface IDelendaiToolSearchOutput {
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

export interface IDelendaiUsageTrackingSessionHygieneOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface IDelendaiUsageTrackingUsageClearOutput {
	ok: true;
	cleared: string[];
}

export interface IDelendaiUsageTrackingUsageReportOutput {
	ok?: boolean;
	[key: string]: unknown;
}

export interface IDelendaiCompactRouterOutput {
	routed: true;
	domain: string;
	action: string;
	tool: string;
	active: boolean;
	isError: boolean;
	text?: string;
	structuredContent?: unknown;
}

/**
 * Compact router typed output. x00519 / b00239 migration: the legacy
 * `IDelendaiVertexOutput` interface is gone — the rebranding is a hard
 * break, not a soft alias. New code MUST import `IDelendaiCompactRouterOutput`.
 */

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface IDelendaiToolOutputs {
	"delendai_adopt_project": IDelendaiAdoptProjectOutput;
	"delendai_agent_catalog": IDelendaiAgentCatalogOutput;
	"delendai_analyze_project": IDelendaiAnalyzeProjectOutput;
	"delendai_browser_browser_a11y": DelendaiBrowserBrowserA11yOutput;
	"delendai_browser_browser_assert": IDelendaiBrowserBrowserAssertOutput;
	"delendai_browser_browser_click": IDelendaiBrowserBrowserClickOutput;
	"delendai_browser_browser_fill": IDelendaiBrowserBrowserFillOutput;
	"delendai_browser_browser_open": IDelendaiBrowserBrowserOpenOutput;
	"delendai_browser_browser_query": IDelendaiBrowserBrowserQueryOutput;
	"delendai_browser_browser_screenshot": IDelendaiBrowserBrowserScreenshotOutput;
	"delendai_browser_browser_verify_page": IDelendaiBrowserBrowserVerifyPageOutput;
	"delendai_completion_clear": IDelendaiCompletionClearOutput;
	"delendai_completion_report_complete": IDelendaiCompletionReportCompleteOutput;
	"delendai_completion_status": IDelendaiCompletionStatusOutput;
	"delendai_configuration_center": IDelendaiConfigurationCenterOutput;
	"delendai_container_container_build": IDelendaiContainerContainerBuildOutput;
	"delendai_container_container_inspect": IDelendaiContainerContainerInspectOutput;
	"delendai_container_container_lint": IDelendaiContainerContainerLintOutput;
	"delendai_container_container_logs": IDelendaiContainerContainerLogsOutput;
	"delendai_container_k8s_apply": DelendaiContainerK8sApplyOutput;
	"delendai_create_plugin": IDelendaiCreatePluginOutput;
	"delendai_create_project": IDelendaiCreateProjectOutput;
	"delendai_diagram_diagram_deps": IDelendaiDiagramDiagramDepsOutput;
	"delendai_diagram_diagram_erd": IDelendaiDiagramDiagramErdOutput;
	"delendai_diagram_diagram_modules": IDelendaiDiagramDiagramModulesOutput;
	"delendai_diagram_diagram_proposals": IDelendaiDiagramDiagramProposalsOutput;
	"delendai_drift_check": IDelendaiDriftCheckOutput;
	"delendai_env_env_check": IDelendaiEnvEnvCheckOutput;
	"delendai_env_env_explains": IDelendaiEnvEnvExplainsOutput;
	"delendai_fs_read": IDelendaiFsReadOutput;
	"delendai_fs_write": IDelendaiFsWriteOutput;
	"delendai_get_validation_matrix": IDelendaiGetValidationMatrixOutput;
	"delendai_i18n_i18n_check": DelendaiI18nI18nCheckOutput;
	"delendai_i18n_i18n_validate": DelendaiI18nI18nValidateOutput;
	"delendai_init_config": IDelendaiInitConfigOutput;
	"delendai_knowledge": IDelendaiKnowledgeOutput;
	"delendai_link-check_link_check": IDelendaiLinkCheckLinkCheckOutput;
	"delendai_metrics": IDelendaiMetricsOutput;
	"delendai_observability_obs_correlate": IDelendaiObservabilityObsCorrelateOutput;
	"delendai_observability_obs_errors": IDelendaiObservabilityObsErrorsOutput;
	"delendai_observability_obs_release_health": IDelendaiObservabilityObsReleaseHealthOutput;
	"delendai_observability_obs_runtime_metrics": IDelendaiObservabilityObsRuntimeMetricsOutput;
	"delendai_observability_obs_trace": IDelendaiObservabilityObsTraceOutput;
	"delendai_overview": IDelendaiOverviewOutput;
	"delendai_perf_perf_bench": IDelendaiPerfPerfBenchOutput;
	"delendai_perf_perf_bundle": IDelendaiPerfPerfBundleOutput;
	"delendai_perf_perf_profile": IDelendaiPerfPerfProfileOutput;
	"delendai_plan_mcp_project": IDelendaiPlanMcpProjectOutput;
	"delendai_plugin_activate": IDelendaiPluginActivateOutput;
	"delendai_plugin_add": IDelendaiPluginAddOutput;
	"delendai_plugin_deactivate": IDelendaiPluginDeactivateOutput;
	"delendai_plugin_search": IDelendaiPluginSearchOutput;
	"delendai_project_context": IDelendaiProjectContextOutput;
	"delendai_project_plugins_create": IDelendaiProjectPluginsCreateOutput;
	"delendai_project_plugins_inspect": IDelendaiProjectPluginsInspectOutput;
	"delendai_project_plugins_repair": IDelendaiProjectPluginsRepairOutput;
	"delendai_prompt-eval_eval_report": IDelendaiPromptEvalEvalReportOutput;
	"delendai_prompt-eval_eval_run": IDelendaiPromptEvalEvalRunOutput;
	"delendai_refactor_refactor_apply": IDelendaiRefactorRefactorApplyOutput;
	"delendai_refactor_refactor_codemod": IDelendaiRefactorRefactorCodemodOutput;
	"delendai_refactor_refactor_definition": IDelendaiRefactorRefactorDefinitionOutput;
	"delendai_refactor_refactor_references": IDelendaiRefactorRefactorReferencesOutput;
	"delendai_refactor_refactor_rename": IDelendaiRefactorRefactorRenameOutput;
	"delendai_refactor_refactor_symbols": IDelendaiRefactorRefactorSymbolsOutput;
	"delendai_scaffold": IDelendaiScaffoldOutput;
	"delendai_security_security_audit": IDelendaiSecuritySecurityAuditOutput;
	"delendai_security_security_deps": IDelendaiSecuritySecurityDepsOutput;
	"delendai_security_security_sast": IDelendaiSecuritySecuritySastOutput;
	"delendai_security_security_secrets": IDelendaiSecuritySecuritySecretsOutput;
	"delendai_skill": IDelendaiSkillOutput;
	"delendai_status": IDelendaiStatusOutput;
	"delendai_tech-debt_debt_scan": IDelendaiTechDebtDebtScanOutput;
	"delendai_tool_search": IDelendaiToolSearchOutput;
	"delendai_usage-tracking_session_hygiene": IDelendaiUsageTrackingSessionHygieneOutput;
	"delendai_usage-tracking_usage_clear": IDelendaiUsageTrackingUsageClearOutput;
	"delendai_usage-tracking_usage_report": IDelendaiUsageTrackingUsageReportOutput;
	"delendai_compact_router": IDelendaiCompactRouterOutput;
}
