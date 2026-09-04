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

export interface DelendaiProposalsAgentLockOutput {
	$schema?: string;
	description?: string;
	tool?: string;
	action?: "claim" | "heartbeat" | "release" | "status" | "gc";
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
	heldFiles?: string[];
	added_files?: string[];
	not_granted?: {
		file: string;
		conflicting_task: string;
	}[];
	cross_process_release?: boolean;
	original_pid?: number;
	blocked?: boolean;
	blocked_reason?: string;
	conflicting_task?: string;
	conflicting_agent?: string;
	overlapping_files?: string[];
	claimed?: boolean;
	released?: boolean;
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
		host?: string;
		pid?: number;
	}[];
	last_seen?: string;
	reason?: string;
	held_ms?: number;
	ok: boolean;
	session?: {
		claims: number;
		releases: number;
		imbalance: number;
	};
	identity?: {
		host?: string;
		model?: string;
		agent_name?: string;
		task_id?: string;
	};
}

export interface DelendaiProposalsAgentLockReleaseOrphanOutput {
	ok: boolean;
	taskId: string;
	agent: string;
	released: boolean;
}

export interface DelendaiProposalsAgentNamesOutput {
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

export interface DelendaiProposalsAgentWorktreeOutput {
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

export interface DelendaiProposalsAgentsLockDiagnoseOutput {
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
	waits: Array<{
		waiter: string;
		waitingOnTaskId: string;
		holder: string | null;
		waitingForSeconds: number | null;
	}>;
	deadlocks: string[][];
}

export interface DelendaiProposalsAutoFixQueueOutput {
	ok: true;
	autoFixable: unknown;
	needsHuman: unknown;
	deduped: number;
	totalClusters: number;
	written?: number;
	files?: string[];
	indexCount?: number;
}

export interface DelendaiProposalsAutoWorkOutput {
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
	action?: "close";
	steps?: string[];
	branchStatusWarnings?: string[];
	executionMode?: "normal" | "confirm-required" | "blocked";
	hygieneBlockers?: string[];
	hygieneActions?: string[];
	hygieneWarnings?: string[];
	stashes?: unknown;
	rescueCandidates?: unknown;
	smokeResiduals?: unknown;
	ok?: boolean;
	blockers?: string[];
}

export interface DelendaiProposalsBranchGcOutput {
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

export interface DelendaiProposalsBranchStatusOutput {
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

export interface DelendaiProposalsCloseSliceOutput {
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
	validationDecision?: {
		mode: "scoped" | "full" | "blocked";
		resolvedScopes: string[];
		snapshotId: string;
		reason: string;
		blockingReasons?: string[];
		nextAction?: string;
	};
	lockReleased?: boolean;
	assignmentReleased?: boolean;
	persist?: {
		committed: boolean;
		pushed: boolean;
		mode: "none" | "commit" | "commit-and-push";
		hash?: string;
		reason?: string;
	};
	pendingIntegrationBranch?: string | null;
	kind?: string;
	validationOutput?: string;
}

export interface DelendaiProposalsCompactStatusOutput {
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

export interface DelendaiProposalsContinueProposalOutput {
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
	action?: "close";
	sliceId?: string;
	validation?: unknown;
	slice?: unknown | null;
	executionGuide?: unknown;
	cascadeTrace?: unknown;
	error?: string;
	blockedBy?: string[];
	pickedFromPaused?: boolean;
}

export interface DelendaiProposalsCreateProposalOutput {
	ok: true;
	file: string;
	path: string;
	disjointnessIssues: {
		first: string;
		second: string;
		file: string;
	}[];
	indexCount: number;
	redactedSecrets?: number;
}

export interface DelendaiProposalsDelegateOutput {
	ok: boolean;
	stage?: "assign" | "worktree" | "lock";
	detail?: Record<string, unknown>;
	agent?: string;
	reason?: string;
	errorId?: string;
	cancelled?: boolean;
	alternatives?: string[];
	errorLogged?: boolean;
	taskId?: string;
	slot?: string;
	files?: string[];
	locked?: boolean;
	subscriptionId?: string;
	worktree?: {
		path: string;
		branch: string;
		created: boolean;
	};
	cwd?: string;
	instruction?: string;
}

export interface DelendaiProposalsGetProposalWorkflowOutput {
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

export interface DelendaiProposalsIncidentProposalsOutput {
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

export interface DelendaiProposalsInheritHostInstructionsOutput {
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

export interface DelendaiProposalsPlanOutput {
	plan: unknown;
	disjointnessIssues: unknown[];
	claimableSliceIds: string[];
}

export interface DelendaiProposalsProposalAdoptOutput {
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
			kind: "feat" | "breaking" | "fix" | "refactor" | "perf" | "audit" | "chore" | "docs" | "test" | "infra" | "spike" | "legacy" | "resume" | "plan" | "repair";
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

export interface DelendaiProposalsProposalBoardOutput {
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

export interface DelendaiProposalsProposalDiagnoseOutput {
	ok: boolean;
	id: string;
	file: string;
	folder: string;
	status: string;
	lockOwners: string[];
	staleTaskIds: string[];
	lastHeartbeat?: string;
	lastAgentDeadEvent?: {
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
	};
	inconsistencies: string[];
	suggestedActions: string[];
	crossProposal?: boolean;
	crossProposalStaleTaskIds: string[];
	crossProposalStaleAgents: string[];
}

export interface DelendaiProposalsProposalForceTransitionOutput {
	ok: boolean;
	id: string;
	from: string;
	to: string;
	reason: string;
	lockReleased: boolean;
	movedTo: string;
	warning?: string;
}

export interface DelendaiProposalsProposalGetOutput {
	proposals?: Array<{
		id: string;
		status: string;
		kind: string | null;
		track: string;
		title: string;
		summary: string;
		progress: string | null;
		next: string | null;
	}>;
	nextCursor?: string | null;
	level?: "compact" | "normal" | "full";
	proposal?: {
		id: string;
		status: string;
		kind: string | null;
		track: string;
		title: string;
		summary: string;
		progress: string | null;
		next: string | null;
		priority: string | null;
		parentPlan: string | null;
		auditSection: string | null;
		related: string[];
		slices: {
			id: string;
			status: string;
			title?: string;
		}[];
		acceptance: {
			command: string;
			expect: string;
		}[];
	};
	history?: {
		timestamp: string;
		action: string;
		agent?: string;
		note?: string;
	}[];
	slices?: {
		id: string;
		status: string;
		title?: string;
	}[];
	reviews?: Array<{
		timestamp: string;
		action: "submit" | "approve" | "request_changes";
		agent: string;
		note?: string;
	}>;
}

export interface DelendaiProposalsProposalReconcileFolderOutput {
	ok: boolean;
	id: string;
	changed?: boolean;
	path?: string;
	dryRun?: boolean;
	wouldChange?: Array<{
		kind: "write" | "delete" | "rename" | "create" | "patch";
		path: string;
		summary: string;
	}>;
	wouldRun?: Array<{
		shape: "shell" | "network" | "process" | "git" | "mcp";
		target: string;
		summary: string;
	}>;
	risk?: "low" | "medium" | "high";
	from?: string;
	to?: string;
	movedTo?: string;
	warning?: string;
}

export interface DelendaiProposalsProposalReviewOutput {
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
	assignmentReleased: boolean;
	redactedSecrets: number;
}

export interface DelendaiProposalsProposalStaleListOutput {
	ok: boolean;
	count: number;
	zombies: Array<{
		kind: "agent-alive" | "agent-idle" | "agent-dead";
		agent: string;
		taskId: string;
		ts: string;
		lastSeen: string;
		missedBeats: number;
		suggestedActions: string[];
	}>;
}

export interface DelendaiProposalsProposalTransitionOutput {
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
	transitionId?: string;
	correlationId?: string;
	idempotencyKey?: string;
	idempotentReplay?: boolean;
	movedFrom?: string;
	movedTo?: string;
	warning?: string;
	indexSynced?: boolean;
	filesRewritten?: number;
}

export interface DelendaiProposalsProposalsClosePlanOutput {
	dryRun: boolean;
	wouldChange?: Array<{
		kind: "write" | "delete" | "rename" | "create" | "patch";
		path: string;
		summary: string;
	}>;
	wouldRun?: Array<{
		shape: "shell" | "network" | "process" | "git" | "mcp";
		target: string;
		summary: string;
	}>;
	risk?: "low" | "medium" | "high";
	note?: string;
	ok?: boolean;
	planId?: string;
	closable?: boolean;
	blockers?: Array<{
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

export interface DelendaiProposalsRoundContextOutput {
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

export interface DelendaiProposalsStateHealthOutput {
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
	heartbeatStalls: {
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

export interface DelendaiProposalsStateRepairOutput {
	mode: "dry-run" | "execute";
	diagnosis: unknown;
	wouldRepair?: unknown;
	repaired?: unknown;
	nextAction?: string;
	[key: string]: unknown;
}

export interface DelendaiProposalsSwarmHygieneOutput {
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

export interface DelendaiProposalsSyncProposalsOutput {
	changed: boolean;
	count: number;
	indexPath: string;
	errors: string[];
}

export interface DelendaiProposalsTaskQueueOutput {
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
	subscriberId?: string;
	subscriptionId?: string;
	leaseUntil?: string;
	renewed?: boolean;
	blocked?: boolean;
	blockerType?: string;
	nextAction?: string;
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

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface ProposalsToolOutputs {
	"delendai_proposals_agent_lock": DelendaiProposalsAgentLockOutput;
	"delendai_proposals_agent_lock_release_orphan": DelendaiProposalsAgentLockReleaseOrphanOutput;
	"delendai_proposals_agent_names": DelendaiProposalsAgentNamesOutput;
	"delendai_proposals_agent_worktree": DelendaiProposalsAgentWorktreeOutput;
	"delendai_proposals_agents_lock_diagnose": DelendaiProposalsAgentsLockDiagnoseOutput;
	"delendai_proposals_auto_fix_queue": DelendaiProposalsAutoFixQueueOutput;
	"delendai_proposals_auto_work": DelendaiProposalsAutoWorkOutput;
	"delendai_proposals_branch_gc": DelendaiProposalsBranchGcOutput;
	"delendai_proposals_branch_status": DelendaiProposalsBranchStatusOutput;
	"delendai_proposals_close_slice": DelendaiProposalsCloseSliceOutput;
	"delendai_proposals_compact_status": DelendaiProposalsCompactStatusOutput;
	"delendai_proposals_continue_proposal": DelendaiProposalsContinueProposalOutput;
	"delendai_proposals_create_proposal": DelendaiProposalsCreateProposalOutput;
	"delendai_proposals_delegate": DelendaiProposalsDelegateOutput;
	"delendai_proposals_get_proposal_workflow": DelendaiProposalsGetProposalWorkflowOutput;
	"delendai_proposals_incident_proposals": DelendaiProposalsIncidentProposalsOutput;
	"delendai_proposals_inherit_host_instructions": DelendaiProposalsInheritHostInstructionsOutput;
	"delendai_proposals_plan": DelendaiProposalsPlanOutput;
	"delendai_proposals_proposal_adopt": DelendaiProposalsProposalAdoptOutput;
	"delendai_proposals_proposal_board": DelendaiProposalsProposalBoardOutput;
	"delendai_proposals_proposal_diagnose": DelendaiProposalsProposalDiagnoseOutput;
	"delendai_proposals_proposal_force_transition": DelendaiProposalsProposalForceTransitionOutput;
	"delendai_proposals_proposal_get": DelendaiProposalsProposalGetOutput;
	"delendai_proposals_proposal_reconcile_folder": DelendaiProposalsProposalReconcileFolderOutput;
	"delendai_proposals_proposal_review": DelendaiProposalsProposalReviewOutput;
	"delendai_proposals_proposal_stale_list": DelendaiProposalsProposalStaleListOutput;
	"delendai_proposals_proposal_transition": DelendaiProposalsProposalTransitionOutput;
	"delendai_proposals_proposals_close_plan": DelendaiProposalsProposalsClosePlanOutput;
	"delendai_proposals_round_context": DelendaiProposalsRoundContextOutput;
	"delendai_proposals_state_health": DelendaiProposalsStateHealthOutput;
	"delendai_proposals_state_repair": DelendaiProposalsStateRepairOutput;
	"delendai_proposals_swarm_hygiene": DelendaiProposalsSwarmHygieneOutput;
	"delendai_proposals_sync_proposals": DelendaiProposalsSyncProposalsOutput;
	"delendai_proposals_task_queue": DelendaiProposalsTaskQueueOutput;
}
