import type { IProposalsToolId } from '../../surface/disclosure';
import type { IProposalsPack } from '../interfaces/proposals-pack.interface';

/** Every registration id in exactly one pack. */
export const PROPOSALS_TOOL_PACK: Readonly<
	Record<IProposalsToolId, IProposalsPack>
> = {
	// read: look at proposals and plans without changing anything
	proposal_get: 'read',
	proposals_search: 'read',
	proposal_board: 'read',
	round_context: 'read',
	compact_status: 'read',
	get_proposal_workflow: 'read',
	proposals_compile_context: 'read',
	continue_proposal: 'read',
	sync_proposals: 'read',
	branch_status: 'read',
	plan: 'read',
	proposal_stale_list: 'read',

	// author: create a proposal and move it through its lifecycle
	create_proposal: 'author',
	proposal_transition: 'author',
	proposal_adopt: 'author',
	close_slice: 'author',
	proposals_close_plan: 'author',
	incident_proposals: 'author',
	delegate: 'author',
	inherit_host_instructions: 'author',

	// review: judge slices another agent delivered
	review_queue: 'review',
	proposal_review: 'review',
	review_claim: 'review',

	// work: claim a slice and run the swarm around it
	agent_lock: 'work',
	agent_worktree: 'work',
	agent_names: 'work',
	auto_work: 'work',
	task_queue: 'work',
	auto_fix_queue: 'work',
	branch_gc: 'work',
	swarm_hygiene: 'work',
	agent_lock_release_orphan: 'work',

	// repair: diagnose, force and reconcile state that went wrong
	agents_lock_diagnose: 'repair',
	proposal_force_transition: 'repair',
	proposal_reconcile_folder: 'repair',
	proposal_diagnose: 'repair',
	state_health: 'repair',
	state_repair: 'repair',
	proposals_summary_backfill: 'repair',
	proposals_conflicts: 'repair',
	proposals_db_doctor: 'repair',
	proposals_db_status: 'repair',
	proposals_db_reconcile: 'repair',
	proposals_db_rebuild: 'repair',
	proposals_db_verify: 'repair',
	proposals_db_diff: 'repair',
	proposals_db_quarantine_list: 'repair',
	proposals_db_quarantine_repair: 'repair',
	proposals_db_tombstones: 'repair',
	proposals_db_resurrect: 'repair',
};
