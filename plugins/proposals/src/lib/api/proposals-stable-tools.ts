import {
	describeStableTool,
	registerStableToolDescriptors,
	type IStableToolDescriptor,
} from '@mcp-vertex/core/lib/api/stable-facade';
import { MCP_VERTEX_VERSION } from '@mcp-vertex/core/version';
import {
	CREATE_PROPOSAL_INPUT_SCHEMA,
	CREATE_PROPOSAL_OUTPUT_SCHEMA,
	REVIEW_INPUT_SCHEMA,
	REVIEW_OUTPUT_SCHEMA,
} from '../tools/authoring.tool';
import {
	AUTO_WORK_INPUT_SCHEMA,
	AUTO_WORK_OUTPUT_SCHEMA,
} from '../tools/auto-work.tool';
import {
	AGENT_LOCK_INPUT_SCHEMA,
	AGENT_LOCK_OUTPUT_SCHEMA,
} from '../tools/agent-lock.tool';
import {
	AGENT_WORKTREE_INPUT_SCHEMA,
	AGENT_WORKTREE_OUTPUT_SCHEMA,
} from '../tools/agent-worktree.tool';
import { PROPOSAL_TRANSITION_INPUT_SCHEMA } from '../contracts/proposal-transition-input.contract';
import { PROPOSAL_TRANSITION_OUTPUT_SCHEMA } from '../tools/proposal-transition.tool';
import {
	TASK_QUEUE_INPUT_SCHEMA,
	TASK_QUEUE_OUTPUT_SCHEMA,
} from '../tools/task-queue.tool';
import {
	STATE_REPAIR_INPUT_SCHEMA,
	STATE_REPAIR_OUTPUT_SCHEMA,
} from '../tools/state-tools.tool';
import {
	FORCE_TRANSITION_INPUT_SCHEMA,
	FORCE_TRANSITION_OUTPUT_SCHEMA,
} from '../tools/recovery-tools';

export const PROPOSALS_STABLE_TOOLS: readonly IStableToolDescriptor[] =
	Object.freeze([
		describeStableTool({
			name: 'proposal_transition',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: PROPOSAL_TRANSITION_INPUT_SCHEMA,
			outputSchema: PROPOSAL_TRANSITION_OUTPUT_SCHEMA,
			summary: 'Move a proposal to a new status against the DFA.',
		}),
		describeStableTool({
			name: 'proposal_create',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: CREATE_PROPOSAL_INPUT_SCHEMA,
			outputSchema: CREATE_PROPOSAL_OUTPUT_SCHEMA,
			summary:
				'Create a new proposal document with frontmatter + slices.',
		}),
		describeStableTool({
			name: 'auto_work',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: AUTO_WORK_INPUT_SCHEMA,
			outputSchema: AUTO_WORK_OUTPUT_SCHEMA,
			summary:
				'Resolve the next proposal slice and return an action plan.',
		}),
		describeStableTool({
			name: 'agent_lock',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: AGENT_LOCK_INPUT_SCHEMA,
			outputSchema: AGENT_LOCK_OUTPUT_SCHEMA,
			summary: 'Claim file ownership for an agent (cross-process lock).',
		}),
		describeStableTool({
			name: 'agent_worktree',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: AGENT_WORKTREE_INPUT_SCHEMA,
			outputSchema: AGENT_WORKTREE_OUTPUT_SCHEMA,
			summary: 'Create or manage per-agent git worktrees.',
		}),
		describeStableTool({
			name: 'proposal_review',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: REVIEW_INPUT_SCHEMA,
			outputSchema: REVIEW_OUTPUT_SCHEMA,
			summary: 'Submit/approve/request-changes on a proposal in review.',
		}),
		describeStableTool({
			name: 'task_queue_enqueue',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: TASK_QUEUE_INPUT_SCHEMA,
			outputSchema: TASK_QUEUE_OUTPUT_SCHEMA,
			summary: 'Push a task onto the persistent swarm queue.',
		}),
		describeStableTool({
			name: 'state_repair',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: STATE_REPAIR_INPUT_SCHEMA,
			outputSchema: STATE_REPAIR_OUTPUT_SCHEMA,
			summary:
				'Auto-heal stale locks, queue backpressure, orphan assignments.',
		}),
		describeStableTool({
			name: 'proposal_force_transition',
			plugin: 'proposals',
			sinceVersion: MCP_VERTEX_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: FORCE_TRANSITION_INPUT_SCHEMA,
			outputSchema: FORCE_TRANSITION_OUTPUT_SCHEMA,
			summary: 'Recovery-path transition (skips peer-review lock).',
		}),
	]);

/** Register the proposals stable facade contribution once the plugin loads. */
export const registerProposalsStableTools =
	(): readonly IStableToolDescriptor[] =>
		registerStableToolDescriptors('proposals', PROPOSALS_STABLE_TOOLS);
