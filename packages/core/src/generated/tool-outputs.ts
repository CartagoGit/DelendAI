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
		plugin: string;
		summary?: string;
		tags?: string[];
		effects?: Array<"write" | "spawn" | "network" | "destructive">;
	}>;
	skills: {
		id: string;
		version: string;
		minCoreVersion: string;
		summary: string;
		appliesTo: string[];
		tags: string[];
		bodyPath: string;
	}[];
	proposals: Array<{
		id: string;
		title: string;
		track: string;
		status: "ready" | "in-progress" | "review" | "paused" | "done" | "blocked" | "retired" | "unspecified";
		kind: "feat" | "fix" | "refactor" | "chore" | "docs" | "plan" | "audit" | "unspecified";
		date: string;
	}>;
}

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
		worstSeverity: "FATAL" | "MUY_MAL" | "MEJORABLE" | "OK" | "MUY_BIEN" | "PERFECTO";
		files: string[];
		seenBy: string[];
	}>;
	topActions: string[];
	markdown: string;
}

export interface McpVertexAuditAuditPlanOutput {
	scope: string;
	markdown: string;
	dimensions: string[];
	availableScopes: Array<{
		name: string;
		label: string;
		kind: "universal" | "layer";
	}>;
}

export interface McpVertexAuditAuditRunOutput {
	scope: string;
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
	scaffolded: {
		id: string;
		filename: string;
		severity: string;
		files: string[];
	}[];
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

export interface McpVertexCreateProjectOutput {
	kind: "host" | "plugin" | "client";
	files: {
		path: string;
		content: string;
	}[];
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

export interface McpVertexDocsDocsListOutput {
	count: number;
	total: number;
	offset: number;
	nextOffset?: number;
	truncated: boolean;
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

export interface McpVertexGitDiffOutput {
	stat: string;
}

export interface McpVertexGitLogOutput {
	commits: {
		hash: string;
		subject: string;
	}[];
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

export interface McpVertexKnowledgeOutput {
	entries?: {
		id: string;
		title: string;
	}[];
	id?: string;
	title?: string;
	body?: string;
}

export interface McpVertexLogsCorrelateOutput {
	chain: Array<{
		ts: string;
		kind: string;
		agent: string | null;
		taskId: string | null;
		outcome: "ok" | "failed" | "timed-out" | "cancelled" | "dead" | "idle" | "unknown";
		files: string[];
		summary: string;
		meta: Record<string, unknown>;
	}>;
	firstTs: string | null;
	lastTs: string | null;
	gaps: {
		startTs: string;
		endTs: string;
		durationMs: number;
	}[];
}

export interface McpVertexLogsQueryOutput {
	events: Array<{
		ts: string;
		kind: string;
		agent: string | null;
		taskId: string | null;
		outcome: "ok" | "failed" | "timed-out" | "cancelled" | "dead" | "idle" | "unknown";
		files: string[];
		summary: string;
		meta: Record<string, unknown>;
	}>;
	cursor: string | null;
	hasMore: boolean;
}

export interface McpVertexLogsRedactTestOutput {
	detected: string[];
	redacted: string;
}

export interface McpVertexLogsSubscribeOutput {
	events: Array<{
		ts: string;
		kind: string;
		agent: string | null;
		taskId: string | null;
		outcome: "ok" | "failed" | "timed-out" | "cancelled" | "dead" | "idle" | "unknown";
		files: string[];
		summary: string;
		meta: Record<string, unknown>;
	}>;
	stream: "logs";
}

export interface McpVertexLogsTailOutput {
	events: Array<{
		ts: string;
		kind: string;
		agent: string | null;
		taskId: string | null;
		outcome: "ok" | "failed" | "timed-out" | "cancelled" | "dead" | "idle" | "unknown";
		files: string[];
		summary: string;
		meta: Record<string, unknown>;
	}>;
	oldestTs: string | null;
	newestTs: string | null;
}

export interface McpVertexMemoryCompactOutput {
	digest: string;
	sections: Array<{
		kind: "decision" | "open" | "fact" | "pointer" | "output" | "exploration" | "superseded";
		heading: string;
		bullets: string[];
	}>;
	tokenAccounting: {
		inputEstimate: number;
		digestEstimate: number;
		savedEstimate: number;
		keptCount: number;
		discardedCount: number;
	};
	persisted: boolean;
	noteId?: string;
	redactedSecrets: number;
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

export interface McpVertexProposalsAgentLockOutput {
	tool?: string;
	action?: "claim" | "release" | "status" | "gc";
	path?: string;
	lock_path?: string;
	task_id?: string;
	agent?: string;
	error?: string | {
		reason: string;
		nextAction?: string;
	};
	blockerType?: string;
	nextAction?: string;
	summary?: string;
	refreshed?: boolean;
	ownership_count?: number;
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
	in_flight?: {
		task_id: string;
		agent: string;
		ownership: string[];
		started_at: string;
		last_seen: string;
		parent_task_id?: string;
	}[];
	ok?: boolean;
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
}

export interface McpVertexProposalsAgentNamesOutput {
	error?: string;
	backup?: string | null;
	nextAction?: string;
	summary?: {
		active: number;
		cooldown: number;
		orphan: number;
		adopted: number;
	};
	assignments?: Array<{
		task_id: string;
		agent_name: string;
		agent_slot: string;
		parent_task_id: string | null;
		depth: number;
		topic: string;
		adopted: boolean;
		assigned_at: string;
		last_seen: string;
		cooldown_until: string | null;
		status: "active" | "cooldown" | "orphan";
		children?: unknown[];
	}>;
	adopted?: {
		name: string;
		task_id: string;
	}[];
	tree?: Array<{
		task_id: string;
		agent_name: string;
		agent_slot: string;
		parent_task_id: string | null;
		depth: number;
		topic: string;
		adopted: boolean;
		assigned_at: string;
		last_seen: string;
		cooldown_until: string | null;
		status: "active" | "cooldown" | "orphan";
		children?: unknown[];
	}>;
	agent?: string;
	status?: string;
	in_cooldown?: boolean;
	task_id?: string;
	released?: string[];
	promoted?: number;
	freed?: number;
	blocked?: boolean;
	blockerType?: string;
	reason?: string;
	depth?: number;
	max_depth?: number;
	allowed?: string[];
	pool_size?: number;
	agent_name?: string;
	agent_slot?: string;
	parent_task_id?: string | null;
	topic?: string;
	assigned_at?: string;
	last_seen?: string;
	cooldown_until?: string | null;
	scannedAt?: string;
	staleAfterMinutes?: number;
	orphans?: Array<{
		agentName: string;
		taskId: string;
		agentSlot: string;
		lastSeen: string;
		ageMinutes: number;
		reason: "cooldown_null" | "stale_no_lock" | "stale_with_orphaned_lock";
		recommendedAction: "force_release" | "extend_cooldown" | "escalate";
	}>;
	threshold?: "green" | "yellow" | "red";
	recommendation?: string;
}

export interface McpVertexProposalsAgentWorktreeOutput {
	ok: boolean;
	action: "create" | "list" | "remove";
	reason?: string;
	path?: string;
	branch?: string;
	created?: boolean;
	removed?: boolean;
	worktrees?: {
		path: string;
		head: string;
		branch?: string;
		detached: boolean;
		locked: boolean;
	}[];
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
	orchestration?: {
		lane: "inspect-then-delegate";
		delegateAfterToolCalls: number;
		next: string;
		policy: string;
	};
	validationCommand?: string;
	persist?: {
		mode: "none" | "commit" | "commit-and-push";
		messageTemplate?: string;
		pushTarget?: string;
	};
	steps?: string[];
	branchStatusWarnings?: string[];
	executionMode?: "normal" | "confirm-required" | "blocked";
	hygieneBlockers?: string[];
	hygieneActions?: string[];
	hygieneWarnings?: string[];
	stashes?: Array<{
		index: number;
		ref: string;
		branch: string | null;
		message: string;
		date: string | null;
	}>;
	rescueCandidates?: {
		branch: string;
		ahead: number;
		behind: number;
		lastCommitMinutesAgo: number;
		worktreePath: string;
		diffStat: string;
		cherryPickHint: string;
	}[];
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
	branches?: {
		name: string;
		head: string;
		ahead: number;
		behind: number;
		mergedIntoBase: boolean;
		lastCommitMinutesAgo: number;
		worktreePath: string;
	}[];
	worktrees?: {
		path: string;
		head: string;
		branch: string;
		outOfCache: boolean;
		dirtyFiles: number;
		untrackedFiles: number;
		ageLabel: string;
	}[];
	summary?: {
		totalBranches: number;
		totalWorktrees: number;
		mergedCount: number;
		aheadOfBaseCount: number;
		behindBaseCount: number;
		dirtyWorktrees: number;
		untrackedWorktrees: number;
		outOfCacheWorktrees: number;
	};
	generatedAt?: string;
}

export interface McpVertexProposalsCloseSliceOutput {
	ok: true;
	proposalId: string;
	sliceId: string;
	closed: boolean;
	lockReleased: boolean;
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
	plan?: {
		proposalId: string;
		slices: Array<{
			proposalId: string;
			sliceId: string;
			title: string;
			owner: string | null;
			files: string[];
			dependsOn: string[];
			gate: "lint" | "type" | "e2e" | "none";
			status: "pending" | "in-progress" | "done" | "blocked";
			acceptanceCriteria: string[];
		}>;
		globalGate: "lint" | "type" | "e2e" | "none";
	};
	disjointnessIssues?: {
		first: string;
		second: string;
		file: string;
	}[];
	claimableSliceIds?: string[];
	sliceId?: string;
	validation?: {
		ok: boolean;
		reason: string;
		blockerType: "none" | "unknown-slice" | "deps-not-done" | "overlap-in-progress" | "already-done" | "already-in-progress";
	};
	slice?: {
		proposalId: string;
		sliceId: string;
		title: string;
		owner: string | null;
		files: string[];
		dependsOn: string[];
		gate: "lint" | "type" | "e2e" | "none";
		status: "pending" | "in-progress" | "done" | "blocked";
		acceptanceCriteria: string[];
	} | null;
	executionGuide?: {
		files: string[];
		acceptanceCriteria: string[];
		gate: "lint" | "type" | "e2e" | "none";
		rules: string[];
	};
	cascadeTrace?: {
		priority?: number;
		cascadeOverrideReason?: string;
		cascadeBoost?: "shipped-blocking" | "customer-reported" | "security";
	};
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
			kind: "proposal" | "fix";
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
}

export interface McpVertexProposalsProposalTransitionOutput {
	ok: boolean;
	error?: {
		reason: string;
		nextAction?: string;
	};
	id?: string;
	from?: string;
	to?: string;
	reason?: string;
	movedFrom?: string;
	movedTo?: string;
	warning?: string;
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
		activeLocks: {
			taskId: string;
			agent: string;
			ownershipCount: number;
			filesPreview: string[];
			lastSeen: string;
			parentTaskId?: string;
		}[];
		activeAgents: {
			agent: string;
			taskId: string;
			slot: string;
			depth: number;
			lastSeen: string;
			adopted: boolean;
		}[];
		coreDocHashes: Record<string, string>;
		sources: {
			chatContext: {
				state: "ok" | "missing" | "corrupt";
				fingerprint: string;
				timestamp: string | null;
				ageMinutes: number | null;
				temporallyStale: boolean;
			};
			checkpoint: {
				state: "ok" | "missing" | "corrupt";
				fingerprint: string;
				timestamp: string | null;
				ageMinutes: number | null;
				temporallyStale: boolean;
			};
			lock: {
				state: "ok" | "missing" | "corrupt";
				fingerprint: string;
				timestamp: string | null;
				ageMinutes: number | null;
				temporallyStale: boolean;
			};
			registry: {
				state: "ok" | "missing" | "corrupt";
				fingerprint: string;
				timestamp: string | null;
				ageMinutes: number | null;
				temporallyStale: boolean;
			};
		};
		chatContext: {
			proposalIds: string[];
			topic?: string;
			lastUpdated?: string;
		};
		checkpoint: {
			proposalId?: string;
			status?: string;
			selectedTask?: string;
			nextAction?: string;
			updatedAt?: string;
		};
		proposalPortfolio: {
			sourceState: "ok" | "missing" | "corrupt";
			strategy: "index" | "fallback-scan";
			activeIds: string[];
			activeOverflowCount: number;
			activeCount: number;
			pendingCount: number;
			inProgressCount: number;
		};
		resumeHint: {
			mode: "resume" | "next" | "unknown";
			proposalId: string;
			reason: string;
			taskId?: string;
		};
		createdAt: string;
		digestVersion: 1;
	} | null;
	stale: boolean;
	recomputedAt: string;
	digestPath: string;
}

export interface McpVertexProposalsStateHealthOutput {
	locks: {
		active: number;
	};
	queue: {
		queueLength: number;
		queuedCount: number;
		waiterOrphans: number;
		oldestAgeMinutes: number;
		threshold: string;
	} | null;
	registry: {
		orphans: number;
		threshold: string;
	};
	healthy: boolean;
}

export interface McpVertexProposalsStateRepairOutput {
	mode: "dry-run" | "execute";
	diagnosis: {
		locks: {
			active: number;
		};
		queue: {
			queueLength: number;
			queuedCount: number;
			waiterOrphans: number;
			oldestAgeMinutes: number;
			threshold: string;
		} | null;
		registry: {
			orphans: number;
			threshold: string;
		};
		healthy: boolean;
	};
	wouldRepair?: {
		staleLocks: number;
		dueQueueEntries: number;
		orphanAssignments: number;
	};
	repaired?: {
		staleLocks: number;
		expiredQueueEntries: number;
		orphanAssignments: number;
	};
	nextAction?: string;
}

export interface McpVertexProposalsSwarmHygieneOutput {
	ok: boolean;
	reason?: string;
	baseBranch?: string;
	generatedAt?: string;
	rescueCandidates?: {
		branch: string;
		ahead: number;
		behind: number;
		lastCommitMinutesAgo: number;
		worktreePath: string;
		diffStat: string;
		cherryPickHint: string;
	}[];
	gcEligible?: Array<{
		path: string;
		branch: string;
		reason: "merged-and-clean" | "merged-and-clean-with-force" | "behind-only" | "no-branch";
		dirtyFiles: number;
		untrackedFiles: number;
		outOfCache: boolean;
		ageLabel: string;
	}>;
	outOfCache?: {
		path: string;
		branch: string;
		head: string;
		lastCommitMinutesAgo: number;
	}[];
	summary?: {
		rescueCandidatesCount: number;
		gcEligibleCount: number;
		outOfCacheCount: number;
	};
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
	scope: string;
	ok: boolean;
	results: {
		command: string;
		ok: boolean;
		code: number;
		timedOut: boolean;
		tail: string;
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
		rules: {
			framework: string;
			presetId: string;
			eslint: string[];
			configs?: string[];
			typecheck: string[];
			reason: string;
		};
	}[];
	conventions: Record<string, string[]>;
	dogmas: Record<string, {
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
	renderedDogmas: Record<string, string>;
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
	hits: {
		file: string;
		line: number;
		text: string;
		before?: string[];
		after?: string[];
	}[];
}

export interface McpVertexSkillOutput {
	skills?: {
		id: string;
		description: string;
		appliesTo: string[];
		tags: string[];
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
	"mcp-vertex_agent_catalog": McpVertexAgentCatalogOutput;
	"mcp-vertex_analyze_project": McpVertexAnalyzeProjectOutput;
	"mcp-vertex_audit_audit_consolidate": McpVertexAuditAuditConsolidateOutput;
	"mcp-vertex_audit_audit_plan": McpVertexAuditAuditPlanOutput;
	"mcp-vertex_audit_audit_run": McpVertexAuditAuditRunOutput;
	"mcp-vertex_cache_cache_gc": McpVertexCacheCacheGcOutput;
	"mcp-vertex_create_project": McpVertexCreateProjectOutput;
	"mcp-vertex_deps_deps_check": McpVertexDepsDepsCheckOutput;
	"mcp-vertex_deps_deps_list": McpVertexDepsDepsListOutput;
	"mcp-vertex_deps_deps_outdated": McpVertexDepsDepsOutdatedOutput;
	"mcp-vertex_deps_deps_polyglot": McpVertexDepsDepsPolyglotOutput;
	"mcp-vertex_docs_docs_list": McpVertexDocsDocsListOutput;
	"mcp-vertex_docs_docs_read": McpVertexDocsDocsReadOutput;
	"mcp-vertex_docs_docs_search": McpVertexDocsDocsSearchOutput;
	"mcp-vertex_drift_check": McpVertexDriftCheckOutput;
	"mcp-vertex_fs_read": McpVertexFsReadOutput;
	"mcp-vertex_fs_write": McpVertexFsWriteOutput;
	"mcp-vertex_get_validation_matrix": McpVertexGetValidationMatrixOutput;
	"mcp-vertex_git_blame": McpVertexGitBlameOutput;
	"mcp-vertex_git_changed": McpVertexGitChangedOutput;
	"mcp-vertex_git_diff": McpVertexGitDiffOutput;
	"mcp-vertex_git_log": McpVertexGitLogOutput;
	"mcp-vertex_git_show": McpVertexGitShowOutput;
	"mcp-vertex_git_status": McpVertexGitStatusOutput;
	"mcp-vertex_git_worktree": McpVertexGitWorktreeOutput;
	"mcp-vertex_knowledge": McpVertexKnowledgeOutput;
	"mcp-vertex_logs_correlate": McpVertexLogsCorrelateOutput;
	"mcp-vertex_logs_query": McpVertexLogsQueryOutput;
	"mcp-vertex_logs_redact_test": McpVertexLogsRedactTestOutput;
	"mcp-vertex_logs_subscribe": McpVertexLogsSubscribeOutput;
	"mcp-vertex_logs_tail": McpVertexLogsTailOutput;
	"mcp-vertex_memory_compact": McpVertexMemoryCompactOutput;
	"mcp-vertex_memory_export": McpVertexMemoryExportOutput;
	"mcp-vertex_memory_forget": McpVertexMemoryForgetOutput;
	"mcp-vertex_memory_import": McpVertexMemoryImportOutput;
	"mcp-vertex_memory_list": McpVertexMemoryListOutput;
	"mcp-vertex_memory_recall": McpVertexMemoryRecallOutput;
	"mcp-vertex_memory_save": McpVertexMemorySaveOutput;
	"mcp-vertex_metrics": McpVertexMetricsOutput;
	"mcp-vertex_notification_await_lock": McpVertexNotificationAwaitLockOutput;
	"mcp-vertex_notification_notify_status": McpVertexNotificationNotifyStatusOutput;
	"mcp-vertex_overview": McpVertexOverviewOutput;
	"mcp-vertex_plan_mcp_project": McpVertexPlanMcpProjectOutput;
	"mcp-vertex_proposals_agent_lock": McpVertexProposalsAgentLockOutput;
	"mcp-vertex_proposals_agent_lock_release_orphan": McpVertexProposalsAgentLockReleaseOrphanOutput;
	"mcp-vertex_proposals_agent_names": McpVertexProposalsAgentNamesOutput;
	"mcp-vertex_proposals_agent_worktree": McpVertexProposalsAgentWorktreeOutput;
	"mcp-vertex_proposals_auto_work": McpVertexProposalsAutoWorkOutput;
	"mcp-vertex_proposals_branch_gc": McpVertexProposalsBranchGcOutput;
	"mcp-vertex_proposals_branch_status": McpVertexProposalsBranchStatusOutput;
	"mcp-vertex_proposals_close_slice": McpVertexProposalsCloseSliceOutput;
	"mcp-vertex_proposals_compact_status": McpVertexProposalsCompactStatusOutput;
	"mcp-vertex_proposals_continue_proposal": McpVertexProposalsContinueProposalOutput;
	"mcp-vertex_proposals_create_proposal": McpVertexProposalsCreateProposalOutput;
	"mcp-vertex_proposals_delegate": McpVertexProposalsDelegateOutput;
	"mcp-vertex_proposals_get_proposal_workflow": McpVertexProposalsGetProposalWorkflowOutput;
	"mcp-vertex_proposals_plan": McpVertexProposalsPlanOutput;
	"mcp-vertex_proposals_proposal_adopt": McpVertexProposalsProposalAdoptOutput;
	"mcp-vertex_proposals_proposal_board": McpVertexProposalsProposalBoardOutput;
	"mcp-vertex_proposals_proposal_diagnose": McpVertexProposalsProposalDiagnoseOutput;
	"mcp-vertex_proposals_proposal_force_transition": McpVertexProposalsProposalForceTransitionOutput;
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
	"mcp-vertex_rules_apply_rules": McpVertexRulesApplyRulesOutput;
	"mcp-vertex_rules_check_rules": McpVertexRulesCheckRulesOutput;
	"mcp-vertex_rules_get_rules": McpVertexRulesGetRulesOutput;
	"mcp-vertex_scaffold": McpVertexScaffoldOutput;
	"mcp-vertex_search_search": McpVertexSearchSearchOutput;
	"mcp-vertex_skill": McpVertexSkillOutput;
	"mcp-vertex_status": McpVertexStatusOutput;
	"mcp-vertex_status-marker_close": McpVertexStatusMarkerCloseOutput;
	"mcp-vertex_status-marker_ping": McpVertexStatusMarkerPingOutput;
	"mcp-vertex_status-marker_validate": McpVertexStatusMarkerValidateOutput;
	"mcp-vertex_test-convention_get_convention": McpVertexTestConventionGetConventionOutput;
	"mcp-vertex_test-convention_scan_drift": McpVertexTestConventionScanDriftOutput;
	"mcp-vertex_test-convention_suggest_spec_path": McpVertexTestConventionSuggestSpecPathOutput;
	"mcp-vertex_web-fetch_web_fetch": McpVertexWebFetchWebFetchOutput;
}
