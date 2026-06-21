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

export interface ProposalsAgentLockOutput {
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

export interface ProposalsAgentLockReleaseOrphanOutput {
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

export interface ProposalsAgentNamesOutput {
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

export interface ProposalsAgentWorktreeOutput {
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

export interface ProposalsAutoWorkOutput {
	state: "idle" | "work";
	idleStreak?: number;
	reason?: string;
	stop?: true;
	handoffPath?: string;
	nextAction?: string;
	proposalId?: string;
	file?: string;
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
}

export interface ProposalsCloseSliceOutput {
	ok: true;
	proposalId: string;
	sliceId: string;
	closed: boolean;
	lockReleased: boolean;
}

export interface ProposalsCompactStatusOutput {
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

export interface ProposalsContinueProposalOutput {
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
	error?: string;
}

export interface ProposalsCreateProposalOutput {
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

export interface ProposalsDelegateOutput {
	ok: boolean;
	stage?: "assign" | "lock";
	detail?: Record<string, unknown>;
	agent?: string;
	reason?: string;
	taskId?: string;
	slot?: string;
	files?: string[];
	locked?: boolean;
	instruction?: string;
}

export interface ProposalsGetProposalWorkflowOutput {
	families: {
		prefix: string;
		description: string;
		cascadePriority: number;
	}[];
	locations: Record<string, string>;
	naming: string;
	rules: string[];
	template: string;
}

export interface ProposalsPlanOutput {
	plan: unknown;
	disjointnessIssues: unknown[];
	claimableSliceIds: string[];
}

export interface ProposalsProposalAdoptOutput {
	ok: true;
	root: string;
	layout: Record<string, unknown>;
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

export interface ProposalsProposalBoardOutput {
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

export interface ProposalsProposalDiagnoseOutput {
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

export interface ProposalsProposalForceTransitionOutput {
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

export interface ProposalsProposalReconcileFolderOutput {
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

export interface ProposalsProposalReviewOutput {
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
}

export interface ProposalsProposalStaleListOutput {
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

export interface ProposalsProposalTransitionOutput {
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

export interface ProposalsRoundContextOutput {
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

export interface ProposalsStateHealthOutput {
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

export interface ProposalsStateRepairOutput {
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

export interface ProposalsSyncProposalsOutput {
	changed: boolean;
	count: number;
	indexPath: string;
	errors: string[];
}

export interface ProposalsTaskQueueOutput {
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

/** Map of this package's MCP tool names to their `structuredContent` type. */
export interface ProposalsToolOutputs {
	"proposals_agent_lock": ProposalsAgentLockOutput;
	"proposals_agent_lock_release_orphan": ProposalsAgentLockReleaseOrphanOutput;
	"proposals_agent_names": ProposalsAgentNamesOutput;
	"proposals_agent_worktree": ProposalsAgentWorktreeOutput;
	"proposals_auto_work": ProposalsAutoWorkOutput;
	"proposals_close_slice": ProposalsCloseSliceOutput;
	"proposals_compact_status": ProposalsCompactStatusOutput;
	"proposals_continue_proposal": ProposalsContinueProposalOutput;
	"proposals_create_proposal": ProposalsCreateProposalOutput;
	"proposals_delegate": ProposalsDelegateOutput;
	"proposals_get_proposal_workflow": ProposalsGetProposalWorkflowOutput;
	"proposals_plan": ProposalsPlanOutput;
	"proposals_proposal_adopt": ProposalsProposalAdoptOutput;
	"proposals_proposal_board": ProposalsProposalBoardOutput;
	"proposals_proposal_diagnose": ProposalsProposalDiagnoseOutput;
	"proposals_proposal_force_transition": ProposalsProposalForceTransitionOutput;
	"proposals_proposal_reconcile_folder": ProposalsProposalReconcileFolderOutput;
	"proposals_proposal_review": ProposalsProposalReviewOutput;
	"proposals_proposal_stale_list": ProposalsProposalStaleListOutput;
	"proposals_proposal_transition": ProposalsProposalTransitionOutput;
	"proposals_round_context": ProposalsRoundContextOutput;
	"proposals_state_health": ProposalsStateHealthOutput;
	"proposals_state_repair": ProposalsStateRepairOutput;
	"proposals_sync_proposals": ProposalsSyncProposalsOutput;
	"proposals_task_queue": ProposalsTaskQueueOutput;
}
