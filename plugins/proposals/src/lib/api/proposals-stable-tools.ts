import type { ZodTypeAny } from 'zod';

import {
	describeStableTool,
	registerStableToolDescriptors,
	type IStableToolDescriptor,
} from '@mcp-vertex/core/lib/api/stable-facade';
import { SCHEMA_VERSION } from '@mcp-vertex/core/lib/api/stable-manifest';

const UNBOUND_SCHEMA = undefined as unknown as ZodTypeAny;

export const PROPOSALS_STABLE_TOOLS: readonly IStableToolDescriptor[] =
	Object.freeze([
		describeStableTool({
			name: 'proposal_transition',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: UNBOUND_SCHEMA,
			outputSchema: UNBOUND_SCHEMA,
			summary: 'Move a proposal to a new status against the DFA.',
		}),
		describeStableTool({
			name: 'proposal_create',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: UNBOUND_SCHEMA,
			outputSchema: UNBOUND_SCHEMA,
			summary:
				'Create a new proposal document with frontmatter + slices.',
		}),
		describeStableTool({
			name: 'auto_work',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: UNBOUND_SCHEMA,
			outputSchema: UNBOUND_SCHEMA,
			summary:
				'Resolve the next proposal slice and return an action plan.',
		}),
		describeStableTool({
			name: 'agent_lock',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: UNBOUND_SCHEMA,
			outputSchema: UNBOUND_SCHEMA,
			summary: 'Claim file ownership for an agent (cross-process lock).',
		}),
		describeStableTool({
			name: 'agent_worktree',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: UNBOUND_SCHEMA,
			outputSchema: UNBOUND_SCHEMA,
			summary: 'Create or manage per-agent git worktrees.',
		}),
		describeStableTool({
			name: 'proposal_review',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: UNBOUND_SCHEMA,
			outputSchema: UNBOUND_SCHEMA,
			summary: 'Submit/approve/request-changes on a proposal in review.',
		}),
		describeStableTool({
			name: 'task_queue_enqueue',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: UNBOUND_SCHEMA,
			outputSchema: UNBOUND_SCHEMA,
			summary: 'Push a task onto the persistent swarm queue.',
		}),
		describeStableTool({
			name: 'state_repair',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: UNBOUND_SCHEMA,
			outputSchema: UNBOUND_SCHEMA,
			summary:
				'Auto-heal stale locks, queue backpressure, orphan assignments.',
		}),
		describeStableTool({
			name: 'proposal_force_transition',
			plugin: 'proposals',
			sinceVersion: SCHEMA_VERSION,
			semverGuarantee: 'additive-only',
			inputSchema: UNBOUND_SCHEMA,
			outputSchema: UNBOUND_SCHEMA,
			summary: 'Recovery-path transition (skips peer-review lock).',
		}),
	]);

/** Register the proposals stable facade contribution once the plugin loads. */
export const registerProposalsStableTools =
	(): readonly IStableToolDescriptor[] =>
		registerStableToolDescriptors('proposals', PROPOSALS_STABLE_TOOLS);
