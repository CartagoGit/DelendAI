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

export interface McpVertexAdaptiveOptimizerOptimizeRunOutput {
	ranked: {
		id: string;
		score: number;
		utility: number;
		relevance: number;
		confidence: number;
		tokenTax: number;
		latencyTax: number;
		permissionRisk: number;
	}[];
	budget: number;
	consent: boolean;
	bytes: number;
	truncated: boolean;
}

export interface McpVertexAdoptProjectOutput {
	ok: true;
	preset: "lean" | "standard" | "minimal" | "swarm";
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
			source: "preset-budget" | "fallback-budget";
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
	matches?: number;
	server: {
		name: string;
		version: string;
		namespacePrefix: string;
	};
	generatedAt: string;
	mode: "compact" | "full";
	counts: {
		tools: number;
		skills: number;
		proposals: number;
	};
	proposalStatusCounts: {
		ready: number;
		"in-progress": number;
		review: number;
		paused: number;
		done: number;
		blocked: number;
		retired: number;
		unspecified: number;
	};
	tools: Array<{
		name: string;
		plugin?: string;
		summary?: string;
		tags?: string[];
		effects?: Array<"write" | "spawn" | "network" | "destructive">;
	}>;
	skills: {
		id: string;
		version?: string;
		minCoreVersion?: string;
		summary?: string;
		appliesTo?: string[];
		tags: string[];
		bodyPath?: string;
	}[];
	proposals: Array<{
		id: string;
		title: string;
		track: string;
		status: "ready" | "in-progress" | "review" | "paused" | "done" | "blocked" | "retired" | "unspecified";
		kind: "feat" | "fix" | "refactor" | "chore" | "docs" | "plan" | "audit" | "unspecified";
		date?: string;
	}>;
	providers?: Array<{
		id: string;
		kind: "api" | "subscription" | "cli" | "mcp-server";
		modelId: string;
		costTier: 1 | 2 | 3 | 4 | 5;
		reachable: boolean;
		strengths: Array<"code-edit" | "long-context" | "very-long-context" | "architecture" | "security-audit" | "reasoning" | "vision" | "fast-iteration" | "json-strict" | "multilingual" | "agentic" | "summarization">;
	}>;
}

export interface McpVertexAnalyzeProjectOutput {
	analysis?: {
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
		ciProvider?: "github-actions" | "gitlab-ci" | "circleci" | "unknown";
		agentConfigs: string[];
		scripts: Record<string, string>;
		docsConventions?: Array<"README.md" | "docs/" | "root-markdown" | "docs-site:astro" | "docs-site:docusaurus" | "docs-site:vitepress">;
		conflicts?: string[];
		signals: string[];
	};
	plan?: {
		projectType: "library" | "cli" | "webapp" | "game" | "monorepo" | "generic";
		serverName: string;
		namespacePrefix: string;
		targetDir: string;
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
	adoptionStrategy: {
		mode: "replace" | "augment" | "partial";
		selectedCapabilities: Array<"tools" | "prompts" | "resources" | "knowledge" | "skills" | "agents" | "mcp-config" | "proposal-workflow">;
		operations: Array<{
			capability: "tools" | "prompts" | "resources" | "knowledge" | "skills" | "agents" | "mcp-config" | "proposal-workflow";
			action: "preserve" | "merge" | "replace";
		}>;
		protectedCapabilities: Array<"tools" | "prompts" | "resources" | "knowledge" | "skills" | "agents" | "mcp-config" | "proposal-workflow">;
		requiresExplicitReplacementConsent: boolean;
	};
	summary?: {
		projectType: "library" | "cli" | "webapp" | "game" | "monorepo" | "generic";
		language: "typescript" | "javascript" | "python" | "go" | "rust" | "unknown";
		packageManager: "bun" | "pnpm" | "yarn" | "npm" | "unknown";
		framework?: string;
		hasMcpProject: boolean;
		serverName: string;
		namespacePrefix: string;
		targetDir: string;
		pluginCount: number;
		toolCount: number;
	};
}

export interface McpVertexAuditAuditConsolidateOutput {
	auditsFound: number;
	skipped: {
		path: string;
		reason: string;
	}[];
	consensus: Array<{
		dimension: string;
		scores: Array<{
			model: string;
			score: number | null;
		}>;
		average: number | null;
	}>;
	findings: Array<{
		id: string;
		titles: string[];
		worstSeverity: "FATAL" | "BAD" | "MINOR" | "OK" | "GOOD" | "PERFECT" | "EXEMPLARY";
		files: string[];
		seenBy: string[];
	}>;
	topActions: string[];
	markdown: string;
	proposals: {
		scaffolded: {
			id: string;
			filename: string;
			severity: string;
			files: string[];
		}[];
		reason?: string;
	} | {
		skipped: string;
	} | {
		disabled: true;
	};
}

export interface McpVertexAuditAuditPlanOutput {
	scope: string;
	mode: "general" | "specific" | "monorepo";
	markdown: string;
	dimensions: string[];
	availableScopes: Array<{
		name: string;
		label: string;
		kind: "universal" | "layer";
	}>;
	projects: string[];
}

export interface McpVertexAuditAuditRunOutput {
	scope: string;
	mode: "general" | "specific" | "monorepo";
	date: string;
	saved: {
		provider: string;
		model: string;
		path: string;
		bytes: number;
		elapsedMs: number;
	}[];
	failed: {
		provider: string;
		model: string;
		error: string;
		elapsedMs: number;
	}[];
	consolidation: {
		auditsFound: number;
		skipped: {
			path: string;
			reason: string;
		}[];
		findings: unknown[];
		topActions: string[];
		markdown: string;
	};
	proposals: {
		scaffolded: {
			id: string;
			filename: string;
			severity: string;
			files: string[];
		}[];
	} | {
		skipped: string;
	} | {
		disabled: true;
	};
	projects: string[];
}

export interface McpVertexAuditSelfAuditOutput {
	ranAt: string;
	worst: "critical" | "high" | "medium" | "low" | "info" | "none";
	summary: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	skipped: {
		id: string;
		note?: string;
	}[];
	scannerCount?: number;
	capabilities?: Record<string, number>;
	backlog: Array<{
		rank: number;
		score: number;
		rationale: string;
		finding: {
			ruleId: string;
			severity: "critical" | "high" | "medium" | "low" | "info";
			message: string;
			location?: {
				file: string;
				line?: number;
				endLine?: number;
			};
			fix?: string;
		};
	}>;
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

export interface McpVertexCacheCacheGcOutput {
	dryRun: boolean;
	appliedAt: string;
	totalBytes: number;
	rulesEvaluated: number;
	removed: {
		id: string;
		path: string;
		bytes: number;
	}[];
	skipped: {
		id: string;
		reason: string;
	}[];
	errors: {
		id: string;
		path: string;
		error: string;
	}[];
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

export interface McpVertexContextForChangeContextForChangeOutput {
	dependsOn: string[];
	files: string[];
	sections: Array<{
		source: "git" | "symbols" | "references" | "tests" | "docs" | "conventions" | "test-policy" | "memory";
		summary: string;
	}>;
	bytes: number;
	truncated: boolean;
	originalBytes?: number;
}

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

export interface McpVertexDocsDocsListOutput {
	count: number;
	total: number;
	offset: number;
	nextOffset?: number;
	truncated: boolean;
	diagnostic?: string;
	docs: {
		path: string;
		title: string;
	}[];
}

export interface McpVertexDocsDocsReadOutput {
	path: string;
	title: string;
	content: string;
	truncated: boolean;
	found: boolean;
	reason?: string;
}

export interface McpVertexDocsDocsSearchOutput {
	ok: false;
	error: {
		reason: "deprecated";
		replacement: string;
		since: string;
		note?: string;
	};
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

export interface McpVertexGitBlameOutput {
	lines: {
		line: number;
		hash: string;
		author: string;
		date: string;
		content: string;
	}[];
}

export interface McpVertexGitChangedOutput {
	changed: string[];
}

export interface McpVertexGitChangelogOutput {
	bump: "major" | "minor" | "patch" | "none";
	total: number;
	groups: {
		type: string;
		entries: {
			hash: string;
			scope?: string;
			subject: string;
			breaking: boolean;
		}[];
	}[];
}

export interface McpVertexGitDiffOutput {
	stat: string;
}

export interface McpVertexGitLogOutput {
	commits: {
		hash: string;
		subject: string;
	}[];
}

export interface McpVertexGitPrListOutput {
	available: boolean;
	note?: string;
	prs: {
		number: number;
		title: string;
		branch: string;
		url: string;
		draft: boolean;
	}[];
}

export interface McpVertexGitPrViewOutput {
	available: boolean;
	note?: string;
	pr?: {
		number: number;
		title: string;
		state: string;
		url: string;
		mergeable: string;
		reviewDecision: string;
		checks: {
			name: string;
			status: string;
			conclusion: string;
			url: string;
		}[];
	};
}

export interface McpVertexGitShowOutput {
	hash: string;
	author: string;
	date: string;
	subject: string;
	stat: string;
}

export interface McpVertexGitStatusOutput {
	branch?: string;
	clean: boolean;
	entries: {
		status: string;
		path: string;
	}[];
}

export interface McpVertexGitWorktreeOutput {
	worktrees: {
		path: string;
		head: string;
		branch?: string;
		bare?: boolean;
		locked?: boolean;
	}[];
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

export interface McpVertexImpactAnalysisImpactAnalyzeOutput {
	changedSymbols: string[];
	dependents: string[];
	affectedPackages: string[];
	recommendedTests: string[];
	risk: "low" | "medium" | "high";
	dependsOn: string[];
	bytes: number;
	truncated: boolean;
}

export interface McpVertexImpactAnalysisTestsForChangeOutput {
	run: string[];
	skip: string[];
	coverageFocus: string[];
	likelyRelatedFailures: string[];
	bytes: number;
	truncated: boolean;
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

export interface McpVertexLogsCorrelateOutput {
	chain: unknown[];
	firstTs: string | null;
	lastTs: string | null;
	gaps: unknown;
}

export interface McpVertexLogsErrorsTailOutput {
	events: unknown[];
	oldestTs: string | null;
	newestTs: string | null;
}

export interface McpVertexLogsIncidentsOutput {
	incidents: unknown;
	totalIncidents: number;
}

export interface McpVertexLogsLogOutput {
	ok: true;
	ts: string;
	incidentType: string;
	severity: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
}

export interface McpVertexLogsQueryOutput {
	events: unknown[];
	cursor: string | null;
	hasMore: boolean;
}

export interface McpVertexLogsRedactTestOutput {
	detected: string[];
	redacted: string;
}

export interface McpVertexLogsSearchOutput {
	events: unknown[];
	matched: number;
	hasMore: boolean;
}

export interface McpVertexLogsSubscribeOutput {
	events: unknown[];
	stream: "logs";
}

export interface McpVertexLogsTailOutput {
	events: unknown[];
	oldestTs: string | null;
	newestTs: string | null;
}

export interface McpVertexMemoryCheckpointPacketOutput {
	available: boolean;
	packet: unknown | null;
	advisory?: unknown;
}

export interface McpVertexMemoryCompactOutput {
	digest: string;
	sections: unknown;
	tokenAccounting: unknown;
	persisted: boolean;
	noteId?: string;
	redactedSecrets: number;
}

export interface McpVertexMemoryCompactionCheckOutput {
	shouldCompact: boolean;
	reason: "token-threshold" | "turn-threshold" | "below-threshold";
	carriedTailTokens: number;
	tokenThreshold: number;
	turnsSinceLastCompaction: number;
	turnThreshold: number;
	hint: string;
}

export interface McpVertexMemoryExportOutput {
	ok: true;
	format: "json" | "ndjson";
	payload: string;
	count: number;
}

export interface McpVertexMemoryForgetOutput {
	ok: true;
	removed: string;
}

export interface McpVertexMemoryImportOutput {
	ok: true;
	imported: number;
	skipped: number;
	overwritten: number;
	merged: number;
	total: number;
	redactedSecrets: number;
}

export interface McpVertexMemoryListOutput {
	notes: {
		id: string;
		title: string;
		tags: string[];
	}[];
	total: number;
	offset: number;
	nextOffset?: number;
}

export interface McpVertexMemoryRecallOutput {
	notes: {
		id: string;
		title: string;
		body: string;
		tags: string[];
		createdAt: string;
		updatedAt: string;
		expiresAt?: string;
	}[];
	sessionDigest?: {
		title: string;
		topic: string;
		body: string;
		createdAt: string;
	};
}

export interface McpVertexMemorySaveOutput {
	ok: true;
	saved: {
		id: string;
		title: string;
		body: string;
		tags: string[];
		createdAt: string;
		updatedAt: string;
		expiresAt?: string;
	};
	redactedSecrets: number;
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

export interface McpVertexNotificationAwaitLockOutput {
	taskId: string;
	released: boolean;
	timedOut: boolean;
	alreadyFree: boolean;
	waitedMs: number;
}

export interface McpVertexNotificationNotifyStatusOutput {
	watching: string;
	emitted: number;
	lastReleases: {
		taskId: string;
		agent: string;
		files: string[];
	}[];
	agentEvents: number;
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
	server: {
		name: string;
		version: string;
	};
	namespacePrefix: string;
	corePaths?: {
		cacheDir: string;
		docsDir: string;
	};
	configIssues?: string[];
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
	}> | Record<string, string[]>;
	knowledge: Array<string | {
		id: string;
		title: string;
	}>;
	providers?: Array<{
		id: string;
		kind: "api" | "subscription" | "cli" | "mcp-server";
		modelId: string;
		costTier: 1 | 2 | 3 | 4 | 5;
		reachable: boolean;
		strengths: Array<"code-edit" | "long-context" | "very-long-context" | "architecture" | "security-audit" | "reasoning" | "vision" | "fast-iteration" | "json-strict" | "multilingual" | "agentic" | "summarization">;
	}>;
	activationReport?: {
		entries: Array<{
			id: string;
			origin: "bundled" | "user-local" | "external";
			active: boolean;
			source: "preset" | "config" | "flag";
			toolCount: number;
		}>;
		counts: {
			bundled: number;
			"user-local": number;
			external: number;
		};
		totalTools: number;
	};
	unusedActivePlugins?: string[];
	projectContext?: {
		surfaceMode: "managed" | "native" | "adaptive" | "compact";
		visibleToolCount: number;
		hiddenToolCount: number;
		loadedPluginCount: number;
		loadedToolCount: number;
	};
	recommendedNextAction: string;
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
	blueprint?: {
		serverName: string;
		namespacePrefix: string;
		targetDir: string;
		projectType: "library" | "cli" | "webapp" | "game" | "monorepo" | "generic";
		plugins: string[];
		tools: {
			name: string;
			description: string;
			body?: string;
			whenToUse?: string[];
		}[];
		prompts: {
			name: string;
			description: string;
			body?: string;
			whenToUse?: string[];
		}[];
		skills: {
			name: string;
			description: string;
			body?: string;
			whenToUse?: string[];
		}[];
		agents: {
			slot: string;
			description: string;
		}[];
		tests: boolean;
		hasExistingServer: boolean;
		adoptionStrategy: {
			mode: "replace" | "augment" | "partial";
			selectedCapabilities: Array<"tools" | "prompts" | "resources" | "knowledge" | "skills" | "agents" | "mcp-config" | "proposal-workflow">;
			operations: Array<{
				capability: "tools" | "prompts" | "resources" | "knowledge" | "skills" | "agents" | "mcp-config" | "proposal-workflow";
				action: "preserve" | "merge" | "replace";
			}>;
			protectedCapabilities: Array<"tools" | "prompts" | "resources" | "knowledge" | "skills" | "agents" | "mcp-config" | "proposal-workflow">;
			requiresExplicitReplacementConsent: boolean;
		};
		defaults: {
			keepLegacy: boolean;
			reasons: string[];
			warnings: string[];
		};
		notes: string[];
	};
	files?: {
		path: string;
		content: string;
	}[];
	summary?: {
		serverName: string;
		namespacePrefix: string;
		targetDir: string;
		projectType: string;
		plugins: string[];
		counts: {
			tools: number;
			prompts: number;
			skills: number;
			agents: number;
		};
		tests: boolean;
		hasExistingServer: boolean;
		adoptionStrategy: {
			mode: "replace" | "augment" | "partial";
			selectedCapabilities: Array<"tools" | "prompts" | "resources" | "knowledge" | "skills" | "agents" | "mcp-config" | "proposal-workflow">;
			operations: Array<{
				capability: "tools" | "prompts" | "resources" | "knowledge" | "skills" | "agents" | "mcp-config" | "proposal-workflow";
				action: "preserve" | "merge" | "replace";
			}>;
			protectedCapabilities: Array<"tools" | "prompts" | "resources" | "knowledge" | "skills" | "agents" | "mcp-config" | "proposal-workflow">;
			requiresExplicitReplacementConsent: boolean;
		};
	};
	detail?: {
		section: "tools" | "prompts" | "skills" | "agents" | "files" | "notes";
		cursor: number;
		nextCursor: number | null;
		total: number;
		items: unknown[];
	};
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

export interface McpVertexProjectHealthProjectHealthOutput {
	score?: number;
	security?: number;
	deps?: number;
	quality?: number;
	debt?: number;
	next?: {
		tool: string;
		reason: string;
	}[];
	domain?: "summary" | "security" | "deps" | "quality" | "debt";
	tool?: string;
	hint?: string;
	dependsOn?: string[];
	bytes: number;
	truncated: boolean;
	originalBytes?: number;
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

export interface McpVertexProposalsAgentLockOutput {
	tool?: string;
	action?: "claim" | "release" | "status" | "gc";
	path?: string;
	lock_path?: string;
	task_id?: string;
	agent?: string;
	error?: unknown;
	blockerType?: string;
	nextAction?: string;
	summary?: string;
	refreshed?: boolean;
	ownership_count?: number;
	cross_process_release?: boolean;
	original_pid?: number;
	blocked?: boolean;
	blocked_reason?: string;
	conflicting_task?: string;
	conflicting_agent?: string;
	overlapping_files?: string[];
	claimed?: boolean;
	removed?: number;
	exists?: boolean;
	active_write_lanes?: number;
	dropped?: number;
	version?: number;
	stale_after_minutes?: number;
	in_flight?: unknown;
	ok: boolean;
	session?: unknown;
	identity?: unknown;
}

export interface McpVertexProposalsAgentLockReleaseOrphanOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
	};
	count?: number;
	zombies?: Array<{
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
		suggestedActions: string[];
	}>;
	taskId?: string;
	agent?: string;
	released?: boolean;
	id?: string;
	from?: string;
	to?: string;
	reason?: string;
	lockReleased?: boolean;
	movedTo?: string;
	warning?: string;
	changed?: boolean;
	path?: string;
	dryRun?: boolean;
	file?: string;
	folder?: string;
	status?: string;
	lockOwners?: string[];
	staleTaskIds?: string[];
	lastHeartbeat?: string;
	lastAgentDeadEvent?: {
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
	};
	inconsistencies?: string[];
	suggestedActions?: string[];
	crossProposal?: boolean;
	crossProposalStaleTaskIds?: string[];
	crossProposalStaleAgents?: string[];
}

export interface McpVertexProposalsAgentNamesOutput {
	error?: string;
	nextAction?: string;
	blocked?: boolean;
	blockerType?: string;
	reason?: string;
	agent?: string;
	status?: string;
	task_id?: string;
	agent_name?: string;
	agent_slot?: string;
	summary?: unknown;
	released?: string[];
	assignments?: unknown;
	tree?: unknown;
	adopted?: unknown;
	[key: string]: unknown;
}

export interface McpVertexProposalsAgentWorktreeOutput {
	ok: boolean;
	action: "create" | "list" | "remove";
	reason?: string;
	path?: string;
	branch?: string;
	created?: boolean;
	removed?: boolean;
	strandedPurge?: {
		dryRun: boolean;
		candidates: Array<{
			branch: string;
			ahead: number;
			behind: number;
			lastCommitIso: string;
			worktreePath: string | null;
		}>;
		deleted: string[];
		skipped: {
			branch: string;
			reason: string;
		}[];
	};
	worktrees?: {
		path: string;
		head: string;
		branch?: string;
		detached: boolean;
		locked: boolean;
	}[];
}

export interface McpVertexProposalsAgentsLockDiagnoseOutput {
	ok: true;
	zombies: {
		task_id: string;
		agent: string;
		ownership: string[];
		started_at: string;
		last_seen: string;
		age_seconds: number;
		parent_task_id?: string;
	}[];
	tmpOrphans: {
		absPath: string;
		relName: string;
		mtime: string;
		ageSeconds: number;
	}[];
	logGaps: Array<{
		task_id: string;
		lock_last_seen: string;
		latest_log_ts: string | null;
		gap_seconds: number | null;
	}>;
}

export interface McpVertexProposalsAutoFixQueueOutput {
	ok: true;
	autoFixable: unknown;
	needsHuman: unknown;
	deduped: number;
	totalClusters: number;
	written?: number;
	files?: string[];
	indexCount?: number;
}

export interface McpVertexProposalsAutoWorkOutput {
	state: "idle" | "work";
	idleStreak?: number;
	reason?: string;
	stop?: true;
	handoffPath?: string;
	nextAction?: string;
	proposalId?: string;
	file?: string;
	pickedFromPaused?: true;
	orchestration?: unknown;
	validationCommand?: string;
	persist?: unknown;
	claimReady?: unknown;
	steps?: string[];
	branchStatusWarnings?: string[];
	executionMode?: "normal" | "confirm-required" | "blocked";
	hygieneBlockers?: string[];
	hygieneActions?: string[];
	hygieneWarnings?: string[];
	stashes?: unknown;
	rescueCandidates?: unknown;
	ok?: boolean;
	blockers?: string[];
}

export interface McpVertexProposalsBranchGcOutput {
	ok: boolean;
	reason?: string;
	baseBranch?: string;
	dryRun?: boolean;
	staleMinutes?: number;
	removed?: Array<{
		path: string;
		branch: string;
		reason: "merged-and-clean" | "merged-and-clean-with-force" | "behind-only" | "no-branch";
		dirtyFiles: number;
		untrackedFiles: number;
		outOfCache: boolean;
		ageLabel: string;
	}>;
	skipped?: Array<{
		path: string;
		branch: string;
		reason: "dirty" | "untracked" | "unmerged" | "fresh" | "protected-branch" | "not-found" | "no-branch";
		detail: string;
	}>;
	summary?: {
		removedCount: number;
		skippedCount: number;
		dryRunRemovedCount: number;
	};
}

export interface McpVertexProposalsBranchStatusOutput {
	ok: boolean;
	reason?: string;
	baseBranch?: string;
	branches?: unknown;
	stranded?: unknown;
	worktrees?: unknown;
	mainCheckoutBranch?: string;
	mainCheckoutDrift?: boolean;
	summary?: unknown;
	generatedAt?: string;
}

export interface McpVertexProposalsCloseSliceOutput {
	ok: boolean;
	blockerType?: string;
	blockerDetail?: {
		ok: boolean;
		severity: "ok" | "error";
		findings: string[];
		summary?: {
			ok: boolean;
			scopes: number;
		};
	};
	error?: {
		reason: string;
		nextAction?: string;
		kind?: string;
		output?: string;
	};
	proposalId?: string;
	sliceId?: string;
	closed?: boolean;
	lockReleased?: boolean;
	pendingIntegrationBranch?: string | null;
	kind?: string;
	validationOutput?: string;
}

export interface McpVertexProposalsCompactStatusOutput {
	locks?: {
		active: number;
	};
	queue?: {
		queued: number;
		promoted: number;
		waiterOrphans: number;
		threshold: string;
	};
	proposals?: {
		total: number;
		actionable: number;
		byStatus: Record<string, number>;
	};
}

export interface McpVertexProposalsContinueProposalOutput {
	kind: "next-proposal" | "no-proposal" | "all-claimed" | "slice-mode-error" | "slice-plan" | "slice-claim-rejected" | "slice-claim";
	reason?: string;
	nextAction?: string;
	proposalId?: string;
	file?: string;
	status?: string;
	relaunchCommand?: string;
	guide?: string[];
	plan?: unknown;
	disjointnessIssues?: unknown;
	claimableSliceIds?: string[];
	sliceId?: string;
	validation?: unknown;
	slice?: unknown | null;
	executionGuide?: unknown;
	cascadeTrace?: unknown;
	error?: string;
	blockedBy?: string[];
	pickedFromPaused?: boolean;
}

export interface McpVertexProposalsCreateProposalOutput {
	ok: true;
	file: string;
	path: string;
	disjointnessIssues: {
		first: string;
		second: string;
		file: string;
	}[];
	indexCount: number;
}

export interface McpVertexProposalsDelegateOutput {
	ok: boolean;
	stage?: "assign" | "worktree" | "lock";
	detail?: Record<string, unknown>;
	agent?: string;
	reason?: string;
	taskId?: string;
	slot?: string;
	files?: string[];
	locked?: boolean;
	worktree?: {
		path: string;
		branch: string;
		created: boolean;
	};
	instruction?: string;
}

export interface McpVertexProposalsGetProposalWorkflowOutput {
	families: {
		prefix: string;
		kind?: string;
		description: string;
		cascadePriority: number;
	}[];
	locations: Record<string, string>;
	naming: string;
	rules: string[];
	template: string;
}

export interface McpVertexProposalsIncidentProposalsOutput {
	ok: true;
	drafts: {
		signature: string;
		toolName: string;
		incidentType: string;
		classification: string;
		title: string;
		summary: string;
		rationale: string;
		suggestedTrack: string;
		sourceCluster: {
			count: number;
			distinctAgents: number;
			firstSeen: string;
			lastSeen: string;
			sampleSummary: string;
			sampleError: string;
			recentEventsCount: number;
		};
	}[];
	deduped: number;
	totalClusters: number;
	written?: number;
	files?: string[];
	indexCount?: number;
}

export interface McpVertexProposalsInheritHostInstructionsOutput {
	ok: true;
	scope: "repo" | "all";
	files: string[];
	totalNonCanonical: number;
	id: string | null;
	file?: string;
	path?: string;
	indexCount?: number;
	redactedSecrets?: number;
}

export interface McpVertexProposalsPlanOutput {
	plan: unknown;
	disjointnessIssues: unknown[];
	claimableSliceIds: string[];
}

export interface McpVertexProposalsProposalAdoptOutput {
	ok: true;
	root: string;
	layout: {
		root: string;
		files: Record<string, string>;
		folders: Record<string, string>;
	};
	scan: {
		proposals: Array<{
			file: string;
			id: string;
			kind: "feat" | "breaking" | "fix" | "refactor" | "perf" | "audit" | "chore" | "docs" | "test" | "infra" | "spike" | "legacy" | "resume" | "plan";
			status: string;
		}>;
		folders: string[];
		hasIndex: boolean;
		hasReadme: boolean;
		unrecognized: string[];
		other: string[];
	};
	plan: string[];
	ready: boolean;
	applied: boolean;
	created: string[];
	skipped: string[];
	migration?: {
		migrated: {
			source: string;
			target: string;
			id: string;
			title: string;
		}[];
		skipped: {
			source: string;
			reason: string;
		}[];
	};
}

export interface McpVertexProposalsProposalBoardOutput {
	proposals: Array<{
		id: string;
		status: string;
		slices: Array<{
			sliceId: string;
			status: string;
			owner: string | null;
		}>;
		claimableSliceIds?: string[];
		unreadable?: string;
	}>;
}

export interface McpVertexProposalsProposalDiagnoseOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
	};
	count?: number;
	zombies?: Array<{
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
		suggestedActions: string[];
	}>;
	taskId?: string;
	agent?: string;
	released?: boolean;
	id?: string;
	from?: string;
	to?: string;
	reason?: string;
	lockReleased?: boolean;
	movedTo?: string;
	warning?: string;
	changed?: boolean;
	path?: string;
	dryRun?: boolean;
	file?: string;
	folder?: string;
	status?: string;
	lockOwners?: string[];
	staleTaskIds?: string[];
	lastHeartbeat?: string;
	lastAgentDeadEvent?: {
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
	};
	inconsistencies?: string[];
	suggestedActions?: string[];
	crossProposal?: boolean;
	crossProposalStaleTaskIds?: string[];
	crossProposalStaleAgents?: string[];
}

export interface McpVertexProposalsProposalForceTransitionOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
	};
	count?: number;
	zombies?: Array<{
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
		suggestedActions: string[];
	}>;
	taskId?: string;
	agent?: string;
	released?: boolean;
	id?: string;
	from?: string;
	to?: string;
	reason?: string;
	lockReleased?: boolean;
	movedTo?: string;
	warning?: string;
	changed?: boolean;
	path?: string;
	dryRun?: boolean;
	file?: string;
	folder?: string;
	status?: string;
	lockOwners?: string[];
	staleTaskIds?: string[];
	lastHeartbeat?: string;
	lastAgentDeadEvent?: {
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
	};
	inconsistencies?: string[];
	suggestedActions?: string[];
	crossProposal?: boolean;
	crossProposalStaleTaskIds?: string[];
	crossProposalStaleAgents?: string[];
}

export interface McpVertexProposalsProposalGetOutput {
	id: string;
	view: unknown;
	level: "compact" | "normal" | "full";
}

export interface McpVertexProposalsProposalReconcileFolderOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
	};
	count?: number;
	zombies?: Array<{
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
		suggestedActions: string[];
	}>;
	taskId?: string;
	agent?: string;
	released?: boolean;
	id?: string;
	from?: string;
	to?: string;
	reason?: string;
	lockReleased?: boolean;
	movedTo?: string;
	warning?: string;
	changed?: boolean;
	path?: string;
	dryRun?: boolean;
	file?: string;
	folder?: string;
	status?: string;
	lockOwners?: string[];
	staleTaskIds?: string[];
	lastHeartbeat?: string;
	lastAgentDeadEvent?: {
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
	};
	inconsistencies?: string[];
	suggestedActions?: string[];
	crossProposal?: boolean;
	crossProposalStaleTaskIds?: string[];
	crossProposalStaleAgents?: string[];
}

export interface McpVertexProposalsProposalReviewOutput {
	ok: true;
	proposalId: string;
	sliceId: string;
	action: string;
	status: "none" | "in_review" | "changes_requested" | "done";
	implementer: string | null;
	reviewer: string | null;
	rounds: Array<{
		verdict: "requested_changes" | "approved";
		agent: string;
		note: string;
	}>;
	lockReleased: boolean;
	redactedSecrets: number;
}

export interface McpVertexProposalsProposalStaleListOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
	};
	count?: number;
	zombies?: Array<{
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
		suggestedActions: string[];
	}>;
	taskId?: string;
	agent?: string;
	released?: boolean;
	id?: string;
	from?: string;
	to?: string;
	reason?: string;
	lockReleased?: boolean;
	movedTo?: string;
	warning?: string;
	changed?: boolean;
	path?: string;
	dryRun?: boolean;
	file?: string;
	folder?: string;
	status?: string;
	lockOwners?: string[];
	staleTaskIds?: string[];
	lastHeartbeat?: string;
	lastAgentDeadEvent?: {
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
	};
	inconsistencies?: string[];
	suggestedActions?: string[];
	crossProposal?: boolean;
	crossProposalStaleTaskIds?: string[];
	crossProposalStaleAgents?: string[];
}

export interface McpVertexProposalsProposalTransitionOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
		code?: string;
		blockerType?: string;
		nextHops?: string[];
	};
	id?: string;
	from?: string;
	to?: string;
	reason?: string;
	movedFrom?: string;
	movedTo?: string;
	warning?: string;
	indexSynced?: boolean;
	filesRewritten?: number;
}

export interface McpVertexProposalsProposalsClosePlanOutput {
	ok: boolean;
	planId: string;
	dryRun: boolean;
	closable: boolean;
	blockers: Array<{
		ref: string;
		kind: "proposal" | "plan" | "slice";
		code: "not-done" | "not-peer-reviewed" | "self-cycle" | "unknown-ref";
		message: string;
	}>;
	preview?: {
		from: string;
		to: string;
		movedFrom?: string;
		movedTo?: string;
	};
	error?: {
		reason: string;
		nextAction?: string;
	};
}

export interface McpVertexProposalsRoundContextOutput {
	digest: {
		roundId: string;
		activeProposalId: string;
		currentTaskId: string;
		createdAt: string;
		digestVersion: 1;
		[key: string]: unknown;
	} | null;
	stale: boolean;
	recomputedAt: string;
	digestPath: string;
	[key: string]: unknown;
}

export interface McpVertexProposalsStateHealthOutput {
	locks: {
		active: number;
		stale: number;
		livelocks: number;
		sessionBalance: {
			claims: number;
			releases: number;
			imbalance: number;
		};
		sessionClaims: number;
		sessionReleases: number;
		sessionImbalance: number;
		[key: string]: unknown;
	};
	stale: {
		count: number;
		[key: string]: unknown;
	};
	peerReviewBypasses: number;
	autoTransitionRepairs: {
		count: number;
		[key: string]: unknown;
	};
	queue: {
		queueLength: number;
		queuedCount: number;
		waiterOrphans: number;
		oldestAgeMinutes: number;
		threshold: string;
		[key: string]: unknown;
	} | null;
	registry: {
		orphans: number;
		threshold: string;
		[key: string]: unknown;
	};
	healthy: boolean;
	[key: string]: unknown;
}

export interface McpVertexProposalsStateRepairOutput {
	mode: "dry-run" | "execute";
	diagnosis: unknown;
	wouldRepair?: unknown;
	repaired?: unknown;
	nextAction?: string;
	[key: string]: unknown;
}

export interface McpVertexProposalsSwarmHygieneOutput {
	ok: boolean;
	reason?: string;
	baseBranch?: string;
	generatedAt?: string;
	rescueCandidates?: unknown;
	gcEligible?: unknown;
	outOfCache?: unknown;
	mainCheckoutBranch?: string;
	mainCheckoutDrift?: boolean;
	pendingIntegration?: unknown;
	nonConformingBranches?: unknown;
	staleUnmerged?: unknown;
	summary?: unknown;
	[key: string]: unknown;
}

export interface McpVertexProposalsSyncProposalsOutput {
	changed: boolean;
	count: number;
	indexPath: string;
	errors: string[];
}

export interface McpVertexProposalsTaskQueueOutput {
	error?: string;
	taskId?: string;
	status?: string;
	queueLength?: number;
	position?: number;
	consumedAt?: string;
	digest?: {
		digests: {
			taskId: string;
			closedAt: string;
			diffSummary?: string;
		}[];
	};
	digests?: {
		taskId: string;
		closedAt: string;
		diffSummary?: string;
	}[];
	pendingTargets?: string[];
	queuedCount?: number;
	promotedCount?: number;
	consumedCount?: number;
	cancelledCount?: number;
	expiredCount?: number;
	waiterOrphans?: number;
	oldestAgeMinutes?: number;
	releaseSignalBacklog?: number;
	threshold?: string;
	recommendation?: string;
}

export interface McpVertexQualityGetQualityScopesOutput {
	scopes: Record<string, {
		command: string;
		expect?: string;
	}[]>;
}

export interface McpVertexQualityQualityCancelOutput {
	cancelled: number[];
	count: number;
}

export interface McpVertexQualityQualityRunAllOutput {
	results: {
		scope: string;
		ok: boolean;
		duration: number;
		errors: string[];
	}[];
	summary: {
		ok: boolean;
		scopes: number;
	};
}

export interface McpVertexQualityRunQualityOutput {
	scope?: string;
	ok: boolean;
	dryRun?: boolean;
	commands?: string[];
	results?: {
		command: string;
		ok: boolean;
		code: number;
		timedOut: boolean;
		tail: string;
	}[];
	severities?: {
		critical: number;
		high: number;
		medium: number;
		low: number;
		info: number;
	};
	worst?: "critical" | "high" | "medium" | "low" | "info" | "none";
	findings?: Array<{
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

export interface McpVertexQualityPolicyQualityPolicyOutput {
	tests?: {
		summary: string;
		mode?: string;
		source?: string;
		guidance?: string[];
		runner?: string;
		mockApi?: string;
		evidence?: string;
		scopes?: string[];
		presets?: {
			area: string;
			presetId: string;
			reason: string;
		}[];
		sampledPaths?: {
			path: string;
			role: string;
		}[];
		roleCounts?: Record<string, number>;
		strict?: boolean;
		exactOptionalPropertyTypes?: boolean;
		noUncheckedIndexedAccess?: boolean;
		noImplicitOverride?: boolean;
		tsconfigChain?: string[];
		coverageThreshold?: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		static?: boolean;
	};
	conventions?: {
		summary: string;
		mode?: string;
		source?: string;
		guidance?: string[];
		runner?: string;
		mockApi?: string;
		evidence?: string;
		scopes?: string[];
		presets?: {
			area: string;
			presetId: string;
			reason: string;
		}[];
		sampledPaths?: {
			path: string;
			role: string;
		}[];
		roleCounts?: Record<string, number>;
		strict?: boolean;
		exactOptionalPropertyTypes?: boolean;
		noUncheckedIndexedAccess?: boolean;
		noImplicitOverride?: boolean;
		tsconfigChain?: string[];
		coverageThreshold?: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		static?: boolean;
	};
	lint?: {
		summary: string;
		mode?: string;
		source?: string;
		guidance?: string[];
		runner?: string;
		mockApi?: string;
		evidence?: string;
		scopes?: string[];
		presets?: {
			area: string;
			presetId: string;
			reason: string;
		}[];
		sampledPaths?: {
			path: string;
			role: string;
		}[];
		roleCounts?: Record<string, number>;
		strict?: boolean;
		exactOptionalPropertyTypes?: boolean;
		noUncheckedIndexedAccess?: boolean;
		noImplicitOverride?: boolean;
		tsconfigChain?: string[];
		coverageThreshold?: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		static?: boolean;
	};
	types?: {
		summary: string;
		mode?: string;
		source?: string;
		guidance?: string[];
		runner?: string;
		mockApi?: string;
		evidence?: string;
		scopes?: string[];
		presets?: {
			area: string;
			presetId: string;
			reason: string;
		}[];
		sampledPaths?: {
			path: string;
			role: string;
		}[];
		roleCounts?: Record<string, number>;
		strict?: boolean;
		exactOptionalPropertyTypes?: boolean;
		noUncheckedIndexedAccess?: boolean;
		noImplicitOverride?: boolean;
		tsconfigChain?: string[];
		coverageThreshold?: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		static?: boolean;
	};
	coverage?: {
		summary: string;
		mode?: string;
		source?: string;
		guidance?: string[];
		runner?: string;
		mockApi?: string;
		evidence?: string;
		scopes?: string[];
		presets?: {
			area: string;
			presetId: string;
			reason: string;
		}[];
		sampledPaths?: {
			path: string;
			role: string;
		}[];
		roleCounts?: Record<string, number>;
		strict?: boolean;
		exactOptionalPropertyTypes?: boolean;
		noUncheckedIndexedAccess?: boolean;
		noImplicitOverride?: boolean;
		tsconfigChain?: string[];
		coverageThreshold?: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		static?: boolean;
	};
	dependsOn: string[];
	bytes: number;
	truncated: boolean;
	originalBytes?: number;
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

export interface McpVertexRulesApplyRulesOutput {
	mode: string;
	modeGuidance: string;
	area: string;
	framework: string;
	eslintConfigs: string[];
	linterConfigs: string[];
	command: string;
	fixCommand: string;
	steps: string[];
}

export interface McpVertexRulesCheckRulesOutput {
	compact: boolean;
	checks: Array<{
		project: string;
		area: string;
		framework: string;
		eslintConfigs?: string[];
		linterConfigs?: string[];
		typecheckConfigs?: string[];
		command: string;
		typecheckCommand?: string;
		missingEslintDeps: string[];
		missingLinterDeps: string[];
		linter: string;
		installHint: string;
		evidence: {
			effective: "project" | "dogma" | "default";
			command: string;
			rationale: string;
			fromProject?: {
				checkCommand: string;
				fixCommand?: string;
				typecheckCommand?: string;
			};
			fromDogma?: {
				checkCommand: string;
				fixCommand?: string;
				typecheckCommand?: string;
			};
			fromDefault: {
				checkCommand: string;
				fixCommand?: string;
				typecheckCommand?: string;
			};
		};
	}>;
	findings: Array<{
		code: "missing-linter-deps" | "missing-eslint-deps";
		severity: "warning";
		project: string;
		area: string;
		framework: string;
		message: string;
		missing: string[];
		nextAction: string;
	}>;
}

export interface McpVertexRulesGetRulesOutput {
	mode: string;
	modeGuidance: string;
	supported: string[];
	areas: {
		project: string;
		area: string;
		rules?: {
			framework: string;
			presetId: string;
			eslint: string[];
			configs?: string[];
			typecheck: string[];
			reason: string;
		};
		presetId?: string;
	}[];
	conventions?: Record<string, string[]>;
	dogmas?: Record<string, {
		language: string;
		displayName?: string;
		version: string;
		packageManager: string;
		ownership: string;
		errorModel: string;
		nullSafety: string;
		naming: string;
		async: string;
		visibility: string;
		immutability: string;
		testing: string;
		bullets: string[];
	}>;
	renderedDogmas?: Record<string, string>;
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

export interface McpVertexSearchSearchOutput {
	query: string;
	count: number;
	truncated: boolean;
	scanned: number;
	usedRg: boolean;
	rgFallbackReason?: string;
	diagnostic?: string;
	availableProviders: Array<{
		id: "openai" | "voyage" | "cohere";
		present: boolean;
	}>;
	hits: {
		file: string;
		line: number;
		text: string;
		before?: string[];
		after?: string[];
	}[];
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

export interface McpVertexStatusMarkerCloseOutput {
	ok: true;
	state: "HECHO" | "CAP" | "RE-PIVOT" | "CHECKPOINT-REQUIRED" | "REPAIR-NEEDED" | "BLOQUEADO" | "SIN PROPUESTAS LIBRES" | "SIN PROPUESTA DE NINGUN TIPO";
	reason?: string;
	locale?: "es" | "en";
	line: string;
}

export interface McpVertexStatusMarkerPingOutput {
	plugin: "status-marker";
	cacheDir: string;
	docsDir: string;
	markers?: {
		userDefined: {
			state: string;
			emoji: string;
			requiresReason: boolean;
			instruction?: string;
		}[];
	};
}

export type McpVertexStatusMarkerValidateOutput = {
	ok: true;
	state: "HECHO" | "CAP" | "RE-PIVOT" | "CHECKPOINT-REQUIRED" | "REPAIR-NEEDED" | "BLOQUEADO" | "SIN PROPUESTAS LIBRES" | "SIN PROPUESTA DE NINGUN TIPO";
	reason?: string;
	line: string;
} | {
	ok: false;
	state?: "HECHO" | "CAP" | "RE-PIVOT" | "CHECKPOINT-REQUIRED" | "REPAIR-NEEDED" | "BLOQUEADO" | "SIN PROPUESTAS LIBRES" | "SIN PROPUESTA DE NINGUN TIPO";
	reason?: string;
	line?: string;
	violation?: string;
	violations?: string[];
};

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

export interface McpVertexTestConventionGetConventionOutput {
	convention: {
		specExtension: string;
		specLayout: "colocate" | "tests-mirror" | "tests-flat";
		runners: string[];
		mockStyle: "vi" | "jest" | "auto";
		requireDescribe: boolean;
		coverageThreshold: {
			lines: number;
			functions: number;
			branches: number;
			statements: number;
		};
		forbiddenPatterns: string[];
		languages: string[];
	};
	markdown: string;
}

export interface McpVertexTestConventionScanDriftOutput {
	ok: boolean;
	counts: {
		error: number;
		warning: number;
		info: number;
	};
	violations: Array<{
		id: string;
		file: string;
		severity: "error" | "warning" | "info";
		hint: string;
		line?: number;
		excerpt?: string;
	}>;
	scannedFiles: number;
}

export interface McpVertexTestConventionSuggestSpecPathOutput {
	specPath: string;
	rationale: string;
	skeleton: string;
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
	observedMcpOnly: true;
	hostLifecycle: {
		observedHostOnly: true;
		source: "claude-code-command-hooks";
		sessions: Array<{
			hostSessionId: string;
			observedHostOnly: true;
			firstActivityAt: string;
			lastActivityAt: string;
			observedElapsedMs: number;
			turnCount: number;
			preCompactCount: number;
			postCompactCount: number;
			sessionEndCount: number;
			lastEvent: "turn" | "pre-compact" | "post-compact" | "session-end";
			explicitMcpSessionIdMatch: boolean;
			matchingMcpCalls: number;
		}>;
	};
	policy: {
		maxSessionAgeMs: number;
		maxIdleGapMs: number;
		maxMcpOutputTokens: number;
	};
	current: Array<{
		sessionId: string;
		observedMcpOnly: true;
		firstActivityAt: string;
		lastActivityAt: string;
		observedElapsedMs: number;
		largestIdleGapMs: number;
		calls: number;
		responseBytes: number;
		estimatedMcpOutputTokens: number;
		reasons: Array<"session-age" | "idle-gap" | "mcp-output-volume">;
	}>;
	sessions: Array<{
		sessionId: string;
		observedMcpOnly: true;
		firstActivityAt: string;
		lastActivityAt: string;
		observedElapsedMs: number;
		largestIdleGapMs: number;
		calls: number;
		responseBytes: number;
		estimatedMcpOutputTokens: number;
		reasons: Array<"session-age" | "idle-gap" | "mcp-output-volume">;
	}>;
}

export interface McpVertexUsageTrackingUsageClearOutput {
	ok: true;
	cleared: string[];
}

export interface McpVertexUsageTrackingUsageReportOutput {
	groupBy: "provider" | "plugin" | "agent" | "extension" | "model";
	windowDays: number;
	totals: {
		calls: number;
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		costUsd: number;
		tokensSaved: number;
		savingsPercent: number;
		errors: number;
		autoBypassed: number;
	};
	buckets: {
		key: string;
		calls: number;
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		costUsd: number;
		tokensSaved: number;
		savingsPercent: number;
		errors: number;
		autoBypassed: number;
	}[];
	pluginKpis: Array<{
		plugin: string;
		observedCalls: number;
		observedSessions: number;
		tokenTax: {
			staticSchemaBytes: number;
			compactTypicalBytes: number;
			p95ResponseBytes: number;
			totalBytes: number;
			estimated: boolean;
			observedToolCount: number;
			observedResponseSamples: number;
			sources: {
				staticSchemaBytes: string;
				compactTypicalBytes: string;
				p95ResponseBytes: string;
			};
		};
		utilityPer1kTokens: number;
		kpis: {
			schemaBytes: number;
			invocationRatePerDay: number;
			successContribution: number;
			responseBytesP50: number | null;
			responseBytesP95: number | null;
			latencyMsP50: number | null;
			latencyMsP95: number | null;
			toolErrorRate: number;
			pluginActivationRate: number | null;
			dynamicActivationSavingsBytes: number | null;
			memoryCompactionSavingsTokens: number;
			contextRehydrationEffectiveness: number | null;
			contextRehydrationEffectivenessNote: string | null;
			privacyGateBlockedReportCount: number | null;
			privacyGateBlockedReportCountNote: string | null;
		};
	}>;
	kpis: {
		coldStartCostBytes: number;
		coldStartCostTokens: number;
		coldStartCostNote: string;
		invocationRatePerDay: number;
		successfulCallRate: number;
		responseBytesP50: number | null;
		responseBytesP95: number | null;
		latencyMsP50: number | null;
		latencyMsP95: number | null;
		toolErrorRate: number;
		averagePluginActivationRate: number | null;
		dynamicActivationSavingsBytes: number | null;
		memoryCompactionSavingsTokens: number;
		memoryCompactionSavingsNote: string;
		contextRehydrationEffectiveness: number | null;
		contextRehydrationEffectivenessNote: string;
		privacyGateBlockedReportCount: number | null;
		privacyGateBlockedReportCountNote: string;
	};
	expensiveCalls: Array<{
		ts: string;
		plugin: string;
		tool: string;
		agent: string;
		provider: string | null;
		costUsd: number | null;
		durationMs: number | null;
		outcome: string;
	}>;
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

export interface McpVertexWebFetchWebFetchOutput {
	ok: boolean;
	url?: string;
	status?: number;
	contentType?: string | null;
	body?: string;
	truncated?: boolean;
	reason?: "blocked-host" | "invalid-url" | "redirect-blocked" | "too-many-redirects" | "timeout" | "fetch-error";
	detail?: string;
}

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface McpVertexToolOutputs {
	"mcp-vertex_adaptive-optimizer_optimize_run": McpVertexAdaptiveOptimizerOptimizeRunOutput;
	"mcp-vertex_adopt_project": McpVertexAdoptProjectOutput;
	"mcp-vertex_agent_catalog": McpVertexAgentCatalogOutput;
	"mcp-vertex_analyze_project": McpVertexAnalyzeProjectOutput;
	"mcp-vertex_audit_audit_consolidate": McpVertexAuditAuditConsolidateOutput;
	"mcp-vertex_audit_audit_plan": McpVertexAuditAuditPlanOutput;
	"mcp-vertex_audit_audit_run": McpVertexAuditAuditRunOutput;
	"mcp-vertex_audit_self_audit": McpVertexAuditSelfAuditOutput;
	"mcp-vertex_browser_browser_a11y": McpVertexBrowserBrowserA11yOutput;
	"mcp-vertex_browser_browser_assert": McpVertexBrowserBrowserAssertOutput;
	"mcp-vertex_browser_browser_click": McpVertexBrowserBrowserClickOutput;
	"mcp-vertex_browser_browser_fill": McpVertexBrowserBrowserFillOutput;
	"mcp-vertex_browser_browser_open": McpVertexBrowserBrowserOpenOutput;
	"mcp-vertex_browser_browser_query": McpVertexBrowserBrowserQueryOutput;
	"mcp-vertex_browser_browser_screenshot": McpVertexBrowserBrowserScreenshotOutput;
	"mcp-vertex_browser_browser_verify_page": McpVertexBrowserBrowserVerifyPageOutput;
	"mcp-vertex_cache_cache_gc": McpVertexCacheCacheGcOutput;
	"mcp-vertex_completion_clear": McpVertexCompletionClearOutput;
	"mcp-vertex_completion_report_complete": McpVertexCompletionReportCompleteOutput;
	"mcp-vertex_completion_status": McpVertexCompletionStatusOutput;
	"mcp-vertex_configuration_center": McpVertexConfigurationCenterOutput;
	"mcp-vertex_container_container_build": McpVertexContainerContainerBuildOutput;
	"mcp-vertex_container_container_inspect": McpVertexContainerContainerInspectOutput;
	"mcp-vertex_container_container_lint": McpVertexContainerContainerLintOutput;
	"mcp-vertex_container_container_logs": McpVertexContainerContainerLogsOutput;
	"mcp-vertex_container_k8s_apply": McpVertexContainerK8sApplyOutput;
	"mcp-vertex_context-for-change_context_for_change": McpVertexContextForChangeContextForChangeOutput;
	"mcp-vertex_create_plugin": McpVertexCreatePluginOutput;
	"mcp-vertex_create_project": McpVertexCreateProjectOutput;
	"mcp-vertex_deps_deps_audit": McpVertexDepsDepsAuditOutput;
	"mcp-vertex_deps_deps_check": McpVertexDepsDepsCheckOutput;
	"mcp-vertex_deps_deps_licenses": McpVertexDepsDepsLicensesOutput;
	"mcp-vertex_deps_deps_list": McpVertexDepsDepsListOutput;
	"mcp-vertex_deps_deps_outdated": McpVertexDepsDepsOutdatedOutput;
	"mcp-vertex_deps_deps_polyglot": McpVertexDepsDepsPolyglotOutput;
	"mcp-vertex_deps_deps_tree": McpVertexDepsDepsTreeOutput;
	"mcp-vertex_diagram_diagram_deps": McpVertexDiagramDiagramDepsOutput;
	"mcp-vertex_diagram_diagram_erd": McpVertexDiagramDiagramErdOutput;
	"mcp-vertex_diagram_diagram_modules": McpVertexDiagramDiagramModulesOutput;
	"mcp-vertex_diagram_diagram_proposals": McpVertexDiagramDiagramProposalsOutput;
	"mcp-vertex_docs_docs_list": McpVertexDocsDocsListOutput;
	"mcp-vertex_docs_docs_read": McpVertexDocsDocsReadOutput;
	"mcp-vertex_docs_docs_search": McpVertexDocsDocsSearchOutput;
	"mcp-vertex_drift_check": McpVertexDriftCheckOutput;
	"mcp-vertex_env_env_check": McpVertexEnvEnvCheckOutput;
	"mcp-vertex_env_env_explains": McpVertexEnvEnvExplainsOutput;
	"mcp-vertex_fs_read": McpVertexFsReadOutput;
	"mcp-vertex_fs_write": McpVertexFsWriteOutput;
	"mcp-vertex_get_validation_matrix": McpVertexGetValidationMatrixOutput;
	"mcp-vertex_git_blame": McpVertexGitBlameOutput;
	"mcp-vertex_git_changed": McpVertexGitChangedOutput;
	"mcp-vertex_git_changelog": McpVertexGitChangelogOutput;
	"mcp-vertex_git_diff": McpVertexGitDiffOutput;
	"mcp-vertex_git_log": McpVertexGitLogOutput;
	"mcp-vertex_git_pr_list": McpVertexGitPrListOutput;
	"mcp-vertex_git_pr_view": McpVertexGitPrViewOutput;
	"mcp-vertex_git_show": McpVertexGitShowOutput;
	"mcp-vertex_git_status": McpVertexGitStatusOutput;
	"mcp-vertex_git_worktree": McpVertexGitWorktreeOutput;
	"mcp-vertex_i18n_i18n_check": McpVertexI18nI18nCheckOutput;
	"mcp-vertex_i18n_i18n_validate": McpVertexI18nI18nValidateOutput;
	"mcp-vertex_impact-analysis_impact_analyze": McpVertexImpactAnalysisImpactAnalyzeOutput;
	"mcp-vertex_impact-analysis_tests_for_change": McpVertexImpactAnalysisTestsForChangeOutput;
	"mcp-vertex_init_config": McpVertexInitConfigOutput;
	"mcp-vertex_knowledge": McpVertexKnowledgeOutput;
	"mcp-vertex_link-check_link_check": McpVertexLinkCheckLinkCheckOutput;
	"mcp-vertex_logs_correlate": McpVertexLogsCorrelateOutput;
	"mcp-vertex_logs_errors_tail": McpVertexLogsErrorsTailOutput;
	"mcp-vertex_logs_incidents": McpVertexLogsIncidentsOutput;
	"mcp-vertex_logs_log": McpVertexLogsLogOutput;
	"mcp-vertex_logs_query": McpVertexLogsQueryOutput;
	"mcp-vertex_logs_redact_test": McpVertexLogsRedactTestOutput;
	"mcp-vertex_logs_search": McpVertexLogsSearchOutput;
	"mcp-vertex_logs_subscribe": McpVertexLogsSubscribeOutput;
	"mcp-vertex_logs_tail": McpVertexLogsTailOutput;
	"mcp-vertex_memory_checkpoint_packet": McpVertexMemoryCheckpointPacketOutput;
	"mcp-vertex_memory_compact": McpVertexMemoryCompactOutput;
	"mcp-vertex_memory_compaction_check": McpVertexMemoryCompactionCheckOutput;
	"mcp-vertex_memory_export": McpVertexMemoryExportOutput;
	"mcp-vertex_memory_forget": McpVertexMemoryForgetOutput;
	"mcp-vertex_memory_import": McpVertexMemoryImportOutput;
	"mcp-vertex_memory_list": McpVertexMemoryListOutput;
	"mcp-vertex_memory_recall": McpVertexMemoryRecallOutput;
	"mcp-vertex_memory_save": McpVertexMemorySaveOutput;
	"mcp-vertex_metrics": McpVertexMetricsOutput;
	"mcp-vertex_notification_await_lock": McpVertexNotificationAwaitLockOutput;
	"mcp-vertex_notification_notify_status": McpVertexNotificationNotifyStatusOutput;
	"mcp-vertex_observability_obs_correlate": McpVertexObservabilityObsCorrelateOutput;
	"mcp-vertex_observability_obs_errors": McpVertexObservabilityObsErrorsOutput;
	"mcp-vertex_observability_obs_release_health": McpVertexObservabilityObsReleaseHealthOutput;
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
	"mcp-vertex_project-health_project_health": McpVertexProjectHealthProjectHealthOutput;
	"mcp-vertex_prompt-eval_eval_report": McpVertexPromptEvalEvalReportOutput;
	"mcp-vertex_prompt-eval_eval_run": McpVertexPromptEvalEvalRunOutput;
	"mcp-vertex_proposals_agent_lock": McpVertexProposalsAgentLockOutput;
	"mcp-vertex_proposals_agent_lock_release_orphan": McpVertexProposalsAgentLockReleaseOrphanOutput;
	"mcp-vertex_proposals_agent_names": McpVertexProposalsAgentNamesOutput;
	"mcp-vertex_proposals_agent_worktree": McpVertexProposalsAgentWorktreeOutput;
	"mcp-vertex_proposals_agents_lock_diagnose": McpVertexProposalsAgentsLockDiagnoseOutput;
	"mcp-vertex_proposals_auto_fix_queue": McpVertexProposalsAutoFixQueueOutput;
	"mcp-vertex_proposals_auto_work": McpVertexProposalsAutoWorkOutput;
	"mcp-vertex_proposals_branch_gc": McpVertexProposalsBranchGcOutput;
	"mcp-vertex_proposals_branch_status": McpVertexProposalsBranchStatusOutput;
	"mcp-vertex_proposals_close_slice": McpVertexProposalsCloseSliceOutput;
	"mcp-vertex_proposals_compact_status": McpVertexProposalsCompactStatusOutput;
	"mcp-vertex_proposals_continue_proposal": McpVertexProposalsContinueProposalOutput;
	"mcp-vertex_proposals_create_proposal": McpVertexProposalsCreateProposalOutput;
	"mcp-vertex_proposals_delegate": McpVertexProposalsDelegateOutput;
	"mcp-vertex_proposals_get_proposal_workflow": McpVertexProposalsGetProposalWorkflowOutput;
	"mcp-vertex_proposals_incident_proposals": McpVertexProposalsIncidentProposalsOutput;
	"mcp-vertex_proposals_inherit_host_instructions": McpVertexProposalsInheritHostInstructionsOutput;
	"mcp-vertex_proposals_plan": McpVertexProposalsPlanOutput;
	"mcp-vertex_proposals_proposal_adopt": McpVertexProposalsProposalAdoptOutput;
	"mcp-vertex_proposals_proposal_board": McpVertexProposalsProposalBoardOutput;
	"mcp-vertex_proposals_proposal_diagnose": McpVertexProposalsProposalDiagnoseOutput;
	"mcp-vertex_proposals_proposal_force_transition": McpVertexProposalsProposalForceTransitionOutput;
	"mcp-vertex_proposals_proposal_get": McpVertexProposalsProposalGetOutput;
	"mcp-vertex_proposals_proposal_reconcile_folder": McpVertexProposalsProposalReconcileFolderOutput;
	"mcp-vertex_proposals_proposal_review": McpVertexProposalsProposalReviewOutput;
	"mcp-vertex_proposals_proposal_stale_list": McpVertexProposalsProposalStaleListOutput;
	"mcp-vertex_proposals_proposal_transition": McpVertexProposalsProposalTransitionOutput;
	"mcp-vertex_proposals_proposals_close_plan": McpVertexProposalsProposalsClosePlanOutput;
	"mcp-vertex_proposals_round_context": McpVertexProposalsRoundContextOutput;
	"mcp-vertex_proposals_state_health": McpVertexProposalsStateHealthOutput;
	"mcp-vertex_proposals_state_repair": McpVertexProposalsStateRepairOutput;
	"mcp-vertex_proposals_swarm_hygiene": McpVertexProposalsSwarmHygieneOutput;
	"mcp-vertex_proposals_sync_proposals": McpVertexProposalsSyncProposalsOutput;
	"mcp-vertex_proposals_task_queue": McpVertexProposalsTaskQueueOutput;
	"mcp-vertex_quality_get_quality_scopes": McpVertexQualityGetQualityScopesOutput;
	"mcp-vertex_quality_quality_cancel": McpVertexQualityQualityCancelOutput;
	"mcp-vertex_quality_quality_run_all": McpVertexQualityQualityRunAllOutput;
	"mcp-vertex_quality_run_quality": McpVertexQualityRunQualityOutput;
	"mcp-vertex_quality-policy_quality_policy": McpVertexQualityPolicyQualityPolicyOutput;
	"mcp-vertex_refactor_refactor_apply": McpVertexRefactorRefactorApplyOutput;
	"mcp-vertex_refactor_refactor_codemod": McpVertexRefactorRefactorCodemodOutput;
	"mcp-vertex_refactor_refactor_definition": McpVertexRefactorRefactorDefinitionOutput;
	"mcp-vertex_refactor_refactor_references": McpVertexRefactorRefactorReferencesOutput;
	"mcp-vertex_refactor_refactor_rename": McpVertexRefactorRefactorRenameOutput;
	"mcp-vertex_refactor_refactor_symbols": McpVertexRefactorRefactorSymbolsOutput;
	"mcp-vertex_rules_apply_rules": McpVertexRulesApplyRulesOutput;
	"mcp-vertex_rules_check_rules": McpVertexRulesCheckRulesOutput;
	"mcp-vertex_rules_get_rules": McpVertexRulesGetRulesOutput;
	"mcp-vertex_scaffold": McpVertexScaffoldOutput;
	"mcp-vertex_search_search": McpVertexSearchSearchOutput;
	"mcp-vertex_security_security_audit": McpVertexSecuritySecurityAuditOutput;
	"mcp-vertex_security_security_deps": McpVertexSecuritySecurityDepsOutput;
	"mcp-vertex_security_security_sast": McpVertexSecuritySecuritySastOutput;
	"mcp-vertex_security_security_secrets": McpVertexSecuritySecuritySecretsOutput;
	"mcp-vertex_skill": McpVertexSkillOutput;
	"mcp-vertex_status": McpVertexStatusOutput;
	"mcp-vertex_status-marker_close": McpVertexStatusMarkerCloseOutput;
	"mcp-vertex_status-marker_ping": McpVertexStatusMarkerPingOutput;
	"mcp-vertex_status-marker_validate": McpVertexStatusMarkerValidateOutput;
	"mcp-vertex_tech-debt_debt_scan": McpVertexTechDebtDebtScanOutput;
	"mcp-vertex_test-convention_get_convention": McpVertexTestConventionGetConventionOutput;
	"mcp-vertex_test-convention_scan_drift": McpVertexTestConventionScanDriftOutput;
	"mcp-vertex_test-convention_suggest_spec_path": McpVertexTestConventionSuggestSpecPathOutput;
	"mcp-vertex_tool_search": McpVertexToolSearchOutput;
	"mcp-vertex_usage-tracking_session_hygiene": McpVertexUsageTrackingSessionHygieneOutput;
	"mcp-vertex_usage-tracking_usage_clear": McpVertexUsageTrackingUsageClearOutput;
	"mcp-vertex_usage-tracking_usage_report": McpVertexUsageTrackingUsageReportOutput;
	"mcp-vertex_vertex": McpVertexVertexOutput;
	"mcp-vertex_web-fetch_web_fetch": McpVertexWebFetchWebFetchOutput;
}
